/*
 * Google Apps Script RPC bridge.
 * A tiny Apps Script HtmlService iframe receives postMessage requests and calls
 * google.script.run, avoiding browser CORS limitations for a GitHub Pages PWA.
 */
(function () {
  'use strict';
  const cfg = window.WEFIXIT_CONFIG;
  let frame = null;
  let ready = false;
  let frameFailed = false;
  let requestCounter = 0;
  const pending = new Map();
  const queue = [];
  const isConfigured = () => /^https:\/\/script\.google\.com\/macros\/s\//.test(String(cfg.GAS_WEB_APP_URL || '')) && !String(cfg.GAS_WEB_APP_URL).includes('PASTE_');

  function notifyFrameReady() {
    ready = true;
    while (queue.length) send(queue.shift());
  }
  function send(item) {
    if (!frame || !frame.contentWindow) { queue.unshift(item); return; }
    try {
      frame.contentWindow.postMessage({
        channel: 'WEFIXIT_PARENT',
        requestId: item.requestId,
        action: item.action,
        payload: item.payload,
        token: item.token || ''
      }, '*');
    } catch (error) {
      pending.delete(item.requestId);
      item.reject(error);
    }
  }
  function setupFrame() {
    if (frame || !isConfigured()) return;
    try {
      const url = new URL(cfg.GAS_WEB_APP_URL);
      url.searchParams.set('bridge', '1');
      url.searchParams.set('parentOrigin', window.location.origin);
      frame = document.createElement('iframe');
      frame.title = 'WEFIXIT secure Apps Script connection';
      frame.setAttribute('aria-hidden', 'true');
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.src = url.toString();
      frame.addEventListener('error', () => { frameFailed = true; });
      document.getElementById('bridge-host').appendChild(frame);
    } catch (error) { frameFailed = true; }
  }

  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.channel !== 'WEFIXIT_BRIDGE') return;
    if (data.type === 'READY') { notifyFrameReady(); return; }
    if (data.type === 'RESULT' && data.requestId) {
      const task = pending.get(data.requestId);
      if (!task) return;
      pending.delete(data.requestId);
      clearTimeout(task.timeout);
      if (data.error) task.reject(new Error(String(data.error)));
      else task.resolve(data.result);
    }
  });

  const api = {
    isConfigured,
    getConfiguredUrl() { return isConfigured() ? cfg.GAS_WEB_APP_URL : ''; },
    async request(action, payload = {}, token = '') {
      if (!isConfigured()) throw new Error('Google Apps Script URL is not configured. Open js/config.js and paste the deployed Web App URL.');
      setupFrame();
      if (frameFailed || !frame) throw new Error('Could not load the Apps Script bridge. Check the deployed Web App URL and its access setting.');
      const requestId = `r${Date.now()}_${++requestCounter}`;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('Apps Script request timed out. The record remains saved locally and can be retried.'));
        }, 55000);
        const item = { requestId, action, payload, token, resolve, reject };
        pending.set(requestId, { resolve, reject, timeout });
        if (ready) send(item); else queue.push(item);
      });
    },
    reset() {
      ready = false;
      frameFailed = false;
      if (frame) { frame.remove(); frame = null; }
      for (const [id, task] of pending) { clearTimeout(task.timeout); task.reject(new Error('Connection reset.')); pending.delete(id); }
      queue.length = 0;
    }
  };
  window.WeFixBridge = api;
  if (isConfigured()) setupFrame();
})();
