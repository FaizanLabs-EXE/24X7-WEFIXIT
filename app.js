(function () {
  'use strict';
  const cfg = window.WEFIXIT_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    jobs: [], customers: [], serverActivity: [], version: 0, token: '', worker: '', currentView: 'dashboard',
    editingJobId: '', photoDrafts: [], activeCustomerId: '', syncBusy: false,
    installPrompt: null, lastServerSync: 0, localMode: false, pendingPrefill: null, existingPhotoCount: 0, lastPrefillPromptPhone: ''
  };

  const statuses = ['Received','Diagnosing','Waiting for parts','In progress','Ready for pickup','Completed','Delivered','On hold','Archived'];
  const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
  const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const escapeHTML = value => String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const digits = value => String(value || '').replace(/\D/g, '').slice(-15);
  const shortDate = value => {
    if (!value) return '—';
    const date = new Date(String(value).length === 10 ? value + 'T00:00:00' : value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };
  const initials = value => String(value || 'W').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || 'W';
  const slugStatus = value => 'status-' + String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const safeFile = value => String(value || 'WEFIXIT').replace(/[\\/:*?"<>|]/g, '-').trim().replace(/\s+/g, '_');
  const makeId = () => 'WF-LOCAL-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
  const statusIsDone = s => ['Completed','Delivered'].includes(String(s));

  function showToast(message, type = 'success', duration = 3600) {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : '✓'}</span><span>${escapeHTML(message)}</span>`;
    $('#toast-region').appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  function showModal({ title, subtitle = '', body = '', actions = '', wide = false }) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">WEFIXIT WORKSPACE</div><h2>${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><button class="modal-close" data-modal-close aria-label="Close">×</button></div><div class="modal-body">${body}</div>${actions ? `<div class="modal-actions">${actions}</div>` : ''}</div></div>`;
    root.querySelector('[data-modal-close]').addEventListener('click', closeModal);
    root.querySelector('[data-modal-backdrop]').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    root.querySelectorAll('[data-modal-action]').forEach(btn => btn.addEventListener('click', () => handleModalAction(btn.dataset.modalAction)));
  }
  function closeModal() { $('#modal-root').innerHTML = ''; state.pendingPrefill = null; }
  async function handleModalAction(action) {
    if (action === 'edit-job') { const id = $('#modal-root').dataset.jobId; closeModal(); loadJobIntoForm(id); return; }
    if (action === 'download-pdf') { const id = $('#modal-root').dataset.jobId; closeModal(); await downloadJobPdf(id); return; }
    if (action === 'view-photos') { const id = $('#modal-root').dataset.jobId; closeModal(); await viewJobPhotos(id); return; }
    if (action === 'archive-job') { const id = $('#modal-root').dataset.jobId; closeModal(); await archiveJob(id); return; }
    if (action === 'new-customer-job') { const id = $('#modal-root').dataset.customerId; closeModal(); startNewJobForCustomer(id); return; }
    if (action === 'confirm-prefill') { const customer = state.pendingPrefill; closeModal(); if (customer) applyCustomerPrefill(customer); return; }
    if (action === 'status-save') {
      const id = $('#modal-root').dataset.jobId;
      const status = $('#quick-status-select')?.value;
      const job = state.jobs.find(item => item.jobId === id);
      closeModal();
      if (job && status) { await saveJobPatch({ ...job, status }); }
      return;
    }
    closeModal();
  }

  function setView(view) {
    if (!$('#view-' + view)) return;
    state.currentView = view;
    $$('.view').forEach(section => section.classList.toggle('active-view', section.id === 'view-' + view));
    $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const label = ({dashboard:'Overview',new:'New repair',jobs:'Repair register',customers:'Customers',reports:'Reports & payments',activity:'Activity log',settings:'Settings'})[view] || 'Overview';
    $('#breadcrumb-current').textContent = label;
    closeSidebar();
    if (view === 'dashboard') renderDashboard();
    if (view === 'jobs') renderJobs();
    if (view === 'customers') renderCustomers();
    if (view === 'reports') renderReports();
    if (view === 'activity') renderActivity();
    if (view === 'settings') renderSettings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebar-scrim').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-scrim').classList.remove('show'); }

  async function initialize() {
    bindEvents();
    $('#received-date').value = new Date().toISOString().slice(0, 10);
    $('#worker-name-form').value = localStorage.getItem(cfg.WORKER_LABEL) || '';
    await WeFixDB.open().catch(error => showToast(error.message, 'error'));
    await loadLocalData();
    const seen = localStorage.getItem('wefixit_intro_seen_v1');
    setTimeout(() => {
      $('#splash').classList.add('done');
      localStorage.setItem('wefixit_intro_seen_v1', '1');
    }, seen ? 450 : 1550);
    const savedWorker = localStorage.getItem(cfg.WORKER_LABEL) || '';
    $('#worker-name').value = savedWorker;
    $('#worker-name-form').value = savedWorker;
    $('#settings-worker').value = savedWorker;
    $('#auth-connection').textContent = WeFixBridge.isConfigured() ? 'Connecting to the shop database…' : 'Local preview · cloud URL not configured';
    const saved = readSession();
    if (saved && saved.token && WeFixBridge.isConfigured()) {
      state.token = saved.token;
      state.worker = saved.worker || savedWorker || 'Shop worker';
      if (!navigator.onLine) {
        await enterWorkspace(false);
        setSyncState('error', 'Offline · showing this device’s cached records; queued changes will sync when connected');
        return;
      }
      try {
        await WeFixBridge.request('sync', { version: state.version }, state.token);
        await enterWorkspace(false);
        await refreshSync(true);
        return;
      } catch (error) {
        if (!navigator.onLine) {
          await enterWorkspace(false);
          setSyncState('error', 'Offline · cached records are available; cloud sync will resume when connected');
          return;
        }
        clearSession();
      }
    } else if (saved && saved.localMode && !WeFixBridge.isConfigured()) {
      state.localMode = true;
      state.worker = saved.worker || savedWorker || 'Shop worker';
      await enterWorkspace(false);
      return;
    }
    $('#auth-screen').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');
    updateConnectionLabels();
  }

  function bindEvents() {
    $('#login-form').addEventListener('submit', handleLogin);
    $('.reveal-password').addEventListener('click', () => {
      const input = $('#access-password'); input.type = input.type === 'password' ? 'text' : 'password';
    });
    $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    $('#menu-toggle').addEventListener('click', openSidebar);
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#sidebar-scrim').addEventListener('click', closeSidebar);
    $('#logout-btn').addEventListener('click', lockWorkspace);
    $('#lock-workspace').addEventListener('click', lockWorkspace);
    $('#sync-now').addEventListener('click', () => syncAll(true));
    $('#top-sync').addEventListener('click', () => syncAll(true));
    $('#sync-settings').addEventListener('click', () => syncAll(true));
    $('#repair-form').addEventListener('submit', handleSaveForm);
    $('#reset-form').addEventListener('click', resetRepairForm);
    $('#total-amount').addEventListener('input', updatePaymentPreview);
    $('#amount-paid').addEventListener('input', updatePaymentPreview);
    $('#customer-phone').addEventListener('blur', detectExistingCustomer);
    $('#customer-lookup').addEventListener('change', handleCustomerLookup);
    $('#prefill-customer').addEventListener('click', () => { if (state.pendingPrefill) askPrefill(state.pendingPrefill); });
    $('#device-photos').addEventListener('change', handlePhotoSelection);
    $('#job-search').addEventListener('input', renderJobs);
    $('#job-status-filter').addEventListener('change', renderJobs);
    $('#job-type-filter').addEventListener('change', renderJobs);
    $('#job-sort').addEventListener('change', renderJobs);
    $('#customer-search').addEventListener('input', renderCustomers);
    $('#global-search').addEventListener('input', renderGlobalSearch);
    $('#global-search').addEventListener('focus', () => { if ($('#global-search').value.trim()) renderGlobalSearch(); });
    document.addEventListener('click', e => { if (!e.target.closest('.global-search')) $('#global-search-results').classList.add('hidden'); });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#global-search').focus(); }
      if (e.key === 'Escape') { closeModal(); closeSidebar(); $('#global-search-results').classList.add('hidden'); }
    });
    $('#jobs-table-body').addEventListener('click', handleJobTableClick);
    $('#customers-grid').addEventListener('click', handleCustomerGridClick);
    $('#recent-jobs').addEventListener('click', e => { const item = e.target.closest('[data-job-id]'); if (item) openJobDetail(item.dataset.jobId); });
    $('#refresh-activity').addEventListener('click', renderActivity);
    $('#test-connection').addEventListener('click', testConnection);
    $('#save-worker').addEventListener('click', saveWorkerProfile);
    $('#download-csv').addEventListener('click', exportCSV);
    $('#settings-install').addEventListener('click', installApp);
    $('#install-btn').addEventListener('click', installApp);
    $('#top-avatar').addEventListener('click', () => setView('settings'));
    document.body.addEventListener('click', handleDataActions);
    window.addEventListener('online', () => { updateConnectionLabels(); syncAll(false); });
    window.addEventListener('offline', updateConnectionLabels);
    window.addEventListener('focus', () => { if (state.token && Date.now() - state.lastServerSync > 15000) refreshSync(false); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.token && Date.now() - state.lastServerSync > 15000) refreshSync(false); });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('#install-btn').classList.remove('hidden'); });
    window.addEventListener('appinstalled', () => { showToast('WEFIXIT installed successfully.'); $('#install-btn').classList.add('hidden'); state.installPrompt = null; });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = $('#access-password').value;
    const worker = $('#worker-name').value.trim() || 'Shop worker';
    const errorBox = $('#auth-error');
    errorBox.textContent = '';
    const button = $('#login-form button[type="submit"]');
    button.disabled = true;
    button.innerHTML = '<span>Verifying access…</span><span>◌</span>';
    try {
      if (WeFixBridge.isConfigured()) {
        const result = await WeFixBridge.request('login', { password, worker, deviceId: getDeviceId() });
        if (!result || !result.token) throw new Error('Login failed. The Apps Script backend returned no session.');
        state.token = result.token;
        state.worker = result.worker || worker;
        state.localMode = false;
        saveSession({ token: state.token, worker: state.worker, expiresAt: result.expiresAt });
      } else {
        if (password !== 'WEFIXIT') throw new Error('Incorrect preview password.');
        state.worker = worker; state.localMode = true; state.token = '';
        saveSession({ localMode: true, worker: worker });
        showToast('Local preview only. Configure Apps Script before sharing this website.', 'error', 5500);
      }
      localStorage.setItem(cfg.WORKER_LABEL, state.worker);
      $('#worker-name-form').value = state.worker;
      $('#settings-worker').value = state.worker;
      await enterWorkspace(true);
      if (!state.localMode) await refreshSync(true);
    } catch (error) {
      errorBox.textContent = error.message || 'Unable to verify workspace access.';
      $('#access-password').select();
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>Unlock workspace</span><span>↗</span>';
    }
  }

  async function enterWorkspace(showIntro) {
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    $('#user-display').textContent = state.worker || 'Shop worker';
    $('#user-avatar').textContent = initials(state.worker);
    $('#top-avatar').textContent = initials(state.worker);
    $('#worker-name-form').value = state.worker;
    $('#settings-worker').value = state.worker;
    renderAll();
    updateConnectionLabels();
    if (showIntro) showToast('Welcome to the shared WEFIXIT workspace.');
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    if (!state.localMode) setTimeout(() => processQueue(), 1200);
    startSyncTimer();
  }

  function lockWorkspace() {
    clearSession();
    state.token = ''; state.localMode = false;
    stopSyncTimer();
    $('#app-shell').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    $('#access-password').value = '';
    $('#auth-error').textContent = '';
    $('#auth-connection').textContent = WeFixBridge.isConfigured() ? 'Locked · sign in to continue' : 'Local preview · cloud URL not configured';
  }
  function readSession() { try { return JSON.parse(localStorage.getItem(cfg.SESSION_LABEL) || 'null'); } catch (_) { return null; } }
  function getDeviceId() {
    let id = localStorage.getItem('wefixit_device_id_v1');
    if (!id) { id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'wf-' + Date.now() + '-' + Math.random().toString(36).slice(2); localStorage.setItem('wefixit_device_id_v1', id); }
    return id;
  }
  function saveSession(value) { localStorage.setItem(cfg.SESSION_LABEL, JSON.stringify(value)); }
  function clearSession() { localStorage.removeItem(cfg.SESSION_LABEL); }

  async function loadLocalData() {
    try {
      const [jobs, version] = await Promise.all([WeFixDB.all('records'), WeFixDB.getMeta('serverVersion', 0)]);
      state.jobs = jobs || []; state.version = Number(version || 0);
      state.customers = deriveCustomers(state.jobs);
    } catch (error) { console.warn(error); }
  }
  function deriveCustomers(jobs) {
    const map = new Map();
    jobs.forEach(job => {
      const key = digits(job.phone) || String(job.customerName || '').toLowerCase();
      if (!key) return;
      const existing = map.get(key) || {};
      map.set(key, {
        customerId: job.customerId || existing.customerId || 'LOCAL-' + key,
        customerName: job.customerName || existing.name || 'Customer',
        name: job.customerName || existing.name || 'Customer',
        customerType: job.customerType || existing.customerType || 'Customer',
        phone: job.phone || existing.phone || '',
        alternatePhone: job.alternatePhone || existing.alternatePhone || '',
        jobs: (existing.jobs || 0) + 1,
        totalPending: Number(existing.totalPending || 0) + Number(job.pendingAmount || 0),
        lastVisit: [existing.lastVisit, job.updatedAt || job.createdAt || ''].filter(Boolean).sort().pop() || ''
      });
    });
    return Array.from(map.values()).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  }
  function updateJobInState(job) {
    const idx = state.jobs.findIndex(item => item.jobId === job.jobId);
    if (idx >= 0) state.jobs[idx] = { ...state.jobs[idx], ...job };
    else state.jobs.unshift(job);
    state.customers = deriveCustomers(state.jobs);
    WeFixDB.put('records', job).catch(() => {});
  }
  function removeJobFromState(jobId) {
    state.jobs = state.jobs.filter(job => job.jobId !== jobId);
    state.customers = deriveCustomers(state.jobs);
    WeFixDB.remove('records', jobId).catch(() => {});
  }
  function mergeServerData(result) {
    if (Array.isArray(result.jobs)) {
      const localById = new Map();
      state.jobs.forEach(job => localById.set(job.jobId, job));
      const serverJobs = result.jobs.map(remote => {
        const local = localById.get(remote.jobId);
        return local && local.localPhotos ? { ...remote, localPhotos: local.localPhotos } : remote;
      });
      return WeFixDB.queued().then(async queue => {
        const byId = new Map(serverJobs.map(job => [job.jobId, job]));
        (queue || []).forEach(item => { if (item.record) byId.set(item.jobId, { ...item.record, localPhotos: item.photos || [] }); });
        state.jobs = Array.from(byId.values());
        // Replace the cache so remotely archived/deleted records do not reappear after a reload.
        await WeFixDB.clear('records');
        for (const job of result.jobs) await WeFixDB.put('records', job);
        for (const item of (queue || [])) if (item.record) await WeFixDB.put('records', { ...item.record, localPhotos: item.photos || [] });
        state.customers = Array.isArray(result.customers) && result.customers.length ? result.customers : deriveCustomers(state.jobs);
        state.serverActivity = Array.isArray(result.activity) ? result.activity : state.serverActivity;
        state.version = Number(result.version || state.version);
        await WeFixDB.setMeta('serverVersion', state.version);
        state.lastServerSync = Date.now();
        renderAll();
      });
    }
    state.version = Number(result.version || state.version);
    state.lastServerSync = Date.now();
    return Promise.resolve();
  }

  async function refreshSync(force) {
    if (!state.token || state.localMode || !WeFixBridge.isConfigured() || !navigator.onLine || state.syncBusy) return;
    state.syncBusy = true; setSyncState('syncing', 'Checking shared records…');
    try {
      const result = await WeFixBridge.request('sync', { version: force ? 0 : state.version, force: Boolean(force) }, state.token);
      if (result.changed) await mergeServerData(result);
      else { state.version = Number(result.version || state.version); state.lastServerSync = Date.now(); }
      setSyncState('online', 'Cloud data is up to date');
      updateConnectionLabels();
      await processQueue(true);
    } catch (error) {
      console.warn('WEFIXIT sync:', error);
      setSyncState('error', 'Cloud sync paused · local records are safe');
      updateConnectionLabels(error.message);
    } finally {
      state.syncBusy = false;
      updateStorageStats();
    }
  }

  async function syncAll(force) {
    if (state.localMode) { showToast('Local preview mode: cloud sync is not configured.', 'error'); return; }
    if (!state.token) { showToast('Unlock the workspace first.', 'error'); return; }
    await processQueue();
    await refreshSync(force !== false);
    showToast('Sync check completed.');
  }

  async function processQueue(fromRefresh = false) {
    if (!state.token || state.localMode || !navigator.onLine || state.processingQueue) return;
    state.processingQueue = true;
    try {
      const queue = await WeFixDB.queued();
      for (const item of queue.sort((a,b) => new Date(a.queuedAt) - new Date(b.queuedAt))) {
        try {
          const result = await WeFixBridge.request('saveRecord', { record: item.record, photos: item.photos || [] }, state.token);
          if (result.record) updateJobInState({ ...result.record, localPhotos: [] });
          await WeFixDB.remove('queue', item.jobId);
          if (result.version) { state.version = Number(result.version); await WeFixDB.setMeta('serverVersion', state.version); }
          await WeFixDB.recordActivity('cloud-save', 'Synced repair ' + item.jobId, item.jobId);
          if (result.warnings && result.warnings.length) showToast(result.warnings.join(' '), 'error', 6000);
        } catch (error) {
          item.attempts = Number(item.attempts || 0) + 1;
          item.lastError = error.message;
          await WeFixDB.put('queue', item);
          setSyncState('error', 'Some changes are waiting for cloud sync');
          if (!fromRefresh) showToast('Sync will retry: ' + error.message, 'error', 5500);
          break;
        }
      }
      if (!(await WeFixDB.queued()).length) setSyncState('online', 'All saved changes synced');
      renderAll();
    } finally {
      state.processingQueue = false;
      updateStorageStats();
    }
  }

  function startSyncTimer() {
    stopSyncTimer();
    state.syncTimer = setInterval(() => {
      if (!document.hidden && state.token && !state.localMode) refreshSync(false);
    }, Math.max(30000, Number(cfg.SYNC_INTERVAL_MS || 60000)));
  }
  function stopSyncTimer() { if (state.syncTimer) clearInterval(state.syncTimer); state.syncTimer = null; }

  function setSyncState(type, message) {
    const indicator = $('#sync-indicator');
    indicator.className = 'sync-state ' + (type === 'online' ? 'state-online' : type === 'error' ? 'state-error' : '');
    indicator.textContent = type === 'online' ? 'ONLINE' : type === 'error' ? 'RETRY' : type === 'syncing' ? 'SYNC' : 'LOCAL';
    $('#sync-message').textContent = message;
  }
  function updateConnectionLabels(errorMessage) {
    const configured = WeFixBridge.isConfigured();
    const online = navigator.onLine;
    const banner = $('#connection-banner');
    const details = [];
    if (!configured) details.push('Google Apps Script URL is not configured. This is a local preview only.');
    else if (!online) details.push('You are offline. New records are stored on this device and will sync when connected.');
    else if (state.localMode) details.push('Local preview mode is active. Cloud authorization is not connected.');
    else if (errorMessage) details.push('Cloud sync issue: ' + errorMessage + '. Local-first saves remain enabled.');
    if (details.length) { banner.textContent = details.join(' '); banner.classList.remove('hidden'); }
    else banner.classList.add('hidden');
    const dot = $('#settings-connection-dot');
    if (dot) dot.classList.toggle('offline', !configured || !online || state.localMode);
    if ($('#settings-connection-title')) $('#settings-connection-title').textContent = !configured ? 'Not configured' : state.localMode ? 'Local preview' : online ? (errorMessage ? 'Connection needs attention' : 'Configured · ready') : 'Offline · local mode';
    if ($('#settings-connection-detail')) $('#settings-connection-detail').textContent = !configured ? 'Paste the Web App URL in js/config.js, then publish.' : state.localMode ? 'No server-side login is active until configured.' : 'Sync uses the locked URL in js/config.js.';
    if ($('#configured-url')) $('#configured-url').textContent = configured ? cfg.GAS_WEB_APP_URL : 'Not configured';
  }

  function renderAll() {
    renderDashboard(); renderJobs(); renderCustomers(); renderReports(); renderActivity(); renderSettings();
    updateStorageStats(); populateCustomerOptions(); updateConnectionLabels();
  }
  function renderDashboard() {
    const visible = state.jobs.filter(job => job.status !== 'Archived');
    const active = visible.filter(job => !statusIsDone(job.status)).length;
    const completed = visible.filter(job => statusIsDone(job.status)).length;
    const collected = visible.reduce((sum, job) => sum + Number(job.amountPaid || 0), 0);
    const pending = visible.reduce((sum, job) => sum + Number(job.pendingAmount || 0), 0);
    $('#metric-active').textContent = active;
    $('#metric-completed').textContent = completed;
    $('#metric-collected').textContent = money(collected);
    $('#metric-pending').textContent = money(pending);
    $('#pipeline-total').textContent = visible.length + ' total jobs';
    const pipelineStatuses = ['Received','Diagnosing','In progress','Waiting for parts','Ready for pickup'];
    $('#pipeline').innerHTML = pipelineStatuses.map(status => {
      const count = visible.filter(job => job.status === status).length;
      const width = visible.length ? Math.round(count / visible.length * 100) : 0;
      return `<div class="pipeline-step"><strong>${count}</strong><small>${escapeHTML(status)}</small><div class="pipeline-line"><i style="width:${width}%"></i></div></div>`;
    }).join('');
    const recent = [...visible].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0,5);
    $('#recent-jobs').innerHTML = recent.map(job => `<div class="recent-item" data-job-id="${escapeHTML(job.jobId)}"><div class="device-avatar">▣</div><div class="recent-copy"><strong>${escapeHTML(job.customerName)} · ${escapeHTML(job.deviceBrand)} ${escapeHTML(job.deviceModel)}</strong><small>${escapeHTML(job.jobId)} · ${escapeHTML(job.phone || '')}</small></div><div class="recent-meta"><strong>${money(job.pendingAmount)}</strong><small><span class="status-tag ${slugStatus(job.status)}">${escapeHTML(job.status)}</span></small></div></div>`).join('');
    $('#recent-empty').classList.toggle('hidden', recent.length > 0);
  }

  function getFilteredJobs() {
    const query = ($('#job-search')?.value || '').trim().toLowerCase();
    const status = $('#job-status-filter')?.value || '';
    const type = $('#job-type-filter')?.value || '';
    const sort = $('#job-sort')?.value || 'newest';
    let jobs = state.jobs.filter(job => job.status !== 'Archived' || status === 'Archived');
    if (query) jobs = jobs.filter(job => [job.jobId,job.customerName,job.phone,job.alternatePhone,job.deviceBrand,job.deviceModel,job.imei,job.problem].join(' ').toLowerCase().includes(query));
    if (status) jobs = jobs.filter(job => job.status === status);
    if (type) jobs = jobs.filter(job => job.customerType === type);
    if (sort === 'oldest') jobs.sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    else if (sort === 'pending') jobs.sort((a,b) => Number(b.pendingAmount || 0) - Number(a.pendingAmount || 0));
    else if (sort === 'name') jobs.sort((a,b) => String(a.customerName || '').localeCompare(String(b.customerName || '')));
    else jobs.sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    return jobs;
  }
  function renderJobs() {
    if (!$('#jobs-table-body')) return;
    const jobs = getFilteredJobs();
    $('#job-result-count').textContent = `${jobs.length} record${jobs.length === 1 ? '' : 's'}`;
    $('#jobs-empty').classList.toggle('hidden', jobs.length > 0);
    $('#jobs-table-body').innerHTML = jobs.map(job => `<tr data-row-job="${escapeHTML(job.jobId)}"><td><div class="job-cell"><div class="device-avatar">▣</div><div><strong>${escapeHTML(job.customerName)}</strong><small>${escapeHTML(job.jobId)} · ${escapeHTML(job.phone)}</small></div></div></td><td><div class="device-cell"><strong>${escapeHTML(job.deviceBrand)} ${escapeHTML(job.deviceModel)}</strong><small>${escapeHTML(job.imei || job.problem || '')}</small></div></td><td><span class="status-tag ${slugStatus(job.status)}">${escapeHTML(job.status)}</span></td><td><div class="amount-cell"><strong>${money(job.totalAmount)}</strong><small>${money(job.pendingAmount)} due</small></div></td><td>${shortDate(job.receivedDate || job.createdAt)}</td><td><div class="row-actions"><button class="row-action" data-row-action="detail" data-job-id="${escapeHTML(job.jobId)}" title="View report">↗</button><button class="row-action" data-row-action="edit" data-job-id="${escapeHTML(job.jobId)}" title="Edit report">✎</button></div></td></tr>`).join('');
  }

  function renderCustomers() {
    if (!$('#customers-grid')) return;
    const query = ($('#customer-search')?.value || '').toLowerCase().trim();
    const customers = deriveCustomers(state.jobs).filter(customer => !query || [customer.name,customer.phone,customer.alternatePhone].join(' ').toLowerCase().includes(query));
    $('#customer-count').textContent = `${customers.length} customers`;
    $('#customers-empty').classList.toggle('hidden', customers.length > 0);
    $('#customers-grid').innerHTML = customers.map(customer => `<article class="customer-card" data-customer-phone="${escapeHTML(customer.phone)}"><div class="customer-card-top"><div class="customer-avatar">${escapeHTML(initials(customer.name))}</div><div><strong>${escapeHTML(customer.name)}</strong><small>${escapeHTML(customer.phone)} · ${escapeHTML(customer.customerType)}</small></div></div><div class="customer-card-stats"><span>${customer.jobs} repair${customer.jobs === 1 ? '' : 's'}</span><b>${money(customer.totalPending)} pending</b></div></article>`).join('');
  }

  function renderReports() {
    if (!$('#report-total')) return;
    const jobs = state.jobs.filter(job => job.status !== 'Archived');
    const total = jobs.reduce((sum, j) => sum + Number(j.totalAmount || 0), 0);
    const collected = jobs.reduce((sum, j) => sum + Number(j.amountPaid || 0), 0);
    const outstanding = jobs.reduce((sum, j) => sum + Number(j.pendingAmount || 0), 0);
    $('#report-total').textContent = money(total);
    $('#report-collected').textContent = money(collected);
    $('#report-outstanding').textContent = money(outstanding);
    $('#report-average').textContent = money(jobs.length ? total / jobs.length : 0);
    const counts = statuses.filter(s => s !== 'Archived').map(status => ({ status, count: jobs.filter(j => j.status === status).length }));
    const max = Math.max(1, ...counts.map(x => x.count));
    $('#status-chart').innerHTML = counts.map(item => `<div class="bar-row"><span>${escapeHTML(item.status)}</span><div class="bar-track"><i style="width:${item.count / max * 100}%"></i></div><b>${item.count}</b></div>`).join('');
    const pending = jobs.filter(job => Number(job.pendingAmount) > 0).sort((a,b) => Number(b.pendingAmount) - Number(a.pendingAmount)).slice(0,7);
    $('#pending-list').innerHTML = pending.length ? pending.map(job => `<div class="pending-row"><div><strong>${escapeHTML(job.customerName)}</strong><small>${escapeHTML(job.deviceBrand)} ${escapeHTML(job.deviceModel)} · ${escapeHTML(job.jobId)}</small></div><b>${money(job.pendingAmount)}</b></div>`).join('') : '<div class="empty-state compact-empty"><span>✓</span><strong>No outstanding balances</strong><p>All repair payments are settled.</p></div>';
  }

  async function renderActivity() {
    if (!$('#activity-list')) return;
    try {
      const localItems = await WeFixDB.all('activity');
      const remoteItems = (state.serverActivity || []).map((item, index) => ({
        id: 'cloud-' + index + '-' + item.at + '-' + item.jobId,
        type: 'cloud', at: item.at, jobId: item.jobId,
        worker: item.worker || 'Shop worker',
        message: (item.action || 'Updated repair') + (item.customerName ? ' · ' + item.customerName : '')
      }));
      const items = [...localItems, ...remoteItems].sort((a,b) => String(b.at).localeCompare(String(a.at)));
      $('#activity-empty').classList.toggle('hidden', items.length > 0);
      $('#activity-list').innerHTML = items.slice(0,100).map(item => `<div class="activity-item"><div class="activity-symbol">${item.type === 'cloud-save' || item.type === 'cloud' ? '⇅' : '✓'}</div><div><strong>${escapeHTML(item.message)}</strong><p>${escapeHTML(item.jobId || '')} · ${escapeHTML(item.worker || state.worker || 'Worker')}${item.detail ? ' · ' + escapeHTML(item.detail) : ''}</p></div><time>${shortDate(item.at)} ${new Date(item.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join('');
    } catch (error) { console.warn(error); }
  }

  async function renderSettings() {
    if (!$('#settings-worker')) return;
    updateConnectionLabels();
    updateStorageStats();
  }
  async function updateStorageStats() {
    try {
      const [queue, records] = await Promise.all([WeFixDB.queued(), WeFixDB.all('records')]);
      $('#local-record-count').textContent = records.length;
      $('#queue-count').textContent = queue.length;
      $('#local-customer-count').textContent = deriveCustomers(records).length;
    } catch (_) {}
  }
  function populateCustomerOptions() {
    const customers = deriveCustomers(state.jobs);
    $('#customer-options').innerHTML = customers.map(customer => `<option value="${escapeHTML(customer.name + ' — ' + customer.phone)}"></option>`).join('');
  }

  function renderGlobalSearch() {
    const query = $('#global-search').value.trim().toLowerCase();
    const pop = $('#global-search-results');
    if (!query) { pop.classList.add('hidden'); pop.innerHTML = ''; return; }
    const jobs = state.jobs.filter(job => [job.jobId,job.customerName,job.phone,job.deviceBrand,job.deviceModel,job.imei].join(' ').toLowerCase().includes(query)).slice(0,8);
    const customers = deriveCustomers(state.jobs).filter(c => [c.name,c.phone,c.alternatePhone].join(' ').toLowerCase().includes(query)).slice(0,4);
    pop.innerHTML = jobs.map(job => `<div class="search-result" data-global-job="${escapeHTML(job.jobId)}"><span class="device-avatar">▣</span><span><strong>${escapeHTML(job.customerName)} · ${escapeHTML(job.deviceModel)}</strong><small>${escapeHTML(job.jobId)} · ${escapeHTML(job.phone)}</small></span><span class="result-code">JOB</span></div>`).join('') + customers.map(c => `<div class="search-result" data-global-customer="${escapeHTML(c.phone)}"><span class="customer-avatar">♙</span><span><strong>${escapeHTML(c.name)}</strong><small>${escapeHTML(c.phone)} · ${c.jobs} repairs</small></span><span class="result-code">CLIENT</span></div>`).join('') || '<div class="search-result"><span><strong>No matching records</strong><small>Try customer name, number or device model.</small></span></div>';
    pop.classList.remove('hidden');
    pop.querySelectorAll('[data-global-job]').forEach(el => el.addEventListener('click', () => { const id = el.dataset.globalJob; pop.classList.add('hidden'); $('#global-search').value = ''; openJobDetail(id); }));
    pop.querySelectorAll('[data-global-customer]').forEach(el => el.addEventListener('click', () => { const phone = el.dataset.globalCustomer; pop.classList.add('hidden'); $('#global-search').value = ''; openCustomerDetailByPhone(phone); }));
  }

  function collectForm() {
    const total = Number($('#total-amount').value || 0);
    const paid = Number($('#amount-paid').value || 0);
    return {
      jobId: state.editingJobId || makeId(),
      customerType: $('#customer-type').value,
      customerName: $('#customer-name').value.trim(),
      phone: $('#customer-phone').value.trim(),
      alternatePhone: $('#customer-alt-phone').value.trim(),
      deviceBrand: $('#device-brand').value.trim(),
      deviceModel: $('#device-model').value.trim(),
      imei: $('#device-imei').value.trim(),
      deviceCondition: $('#device-condition').value,
      problem: $('#device-problem').value.trim(),
      replacedParts: $('#replaced-parts').value.trim(),
      accessories: $('#accessories').value.trim(),
      totalAmount: total,
      amountPaid: paid,
      pendingAmount: Math.max(0, total - paid),
      paymentMethod: $('#payment-method').value,
      phoneLocation: $('#phone-location').value.trim(),
      deviceGivenTo: $('#device-given-to').value.trim(),
      notes: $('#repair-notes').value.trim(),
      status: $('#repair-status').value,
      priority: $('#repair-priority').value,
      receivedDate: $('#received-date').value,
      dueDate: $('#due-date').value,
      warrantyDays: Number($('#warranty-days').value || 0),
      worker: $('#worker-name-form').value.trim() || state.worker || 'Shop worker',
      photos: [],
      createdAt: state.jobs.find(j => j.jobId === state.editingJobId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function handleSaveForm(event) {
    event.preventDefault();
    const record = collectForm();
    if (!$('#repair-form').reportValidity()) return;
    if (digits(record.phone).length < 7) { showToast('Enter a valid customer phone number.', 'error'); $('#customer-phone').focus(); return; }
    if (record.amountPaid > record.totalAmount) { showToast('Amount given cannot exceed total amount.', 'error'); $('#amount-paid').focus(); return; }
    const button = $('#save-report');
    button.disabled = true; $('#save-button-label').textContent = 'Saving locally…';
    try {
      const photos = state.photoDrafts.map(p => ({ name: p.name, dataUrl: p.dataUrl }));
      const localRecord = { ...record, localPhotos: photos, photoCount: Math.max(record.photos.length || 0, photos.length) };
      updateJobInState(localRecord);
      await WeFixDB.enqueue({ jobId: record.jobId, record, photos, attempts: 0 });
      await WeFixDB.recordActivity('local-save', (state.editingJobId ? 'Updated repair ' : 'Created repair ') + record.jobId, record.jobId);
      renderAll();
      const wasEditing = Boolean(state.editingJobId);
      resetRepairForm();
      setView('jobs');
      showToast(wasEditing ? 'Repair updated locally. Cloud sync queued.' : 'Repair saved locally. Cloud sync queued.');
      $('#save-button-label').textContent = 'Save report & generate PDF';
      if (state.token && !state.localMode && navigator.onLine) {
        processQueue().then(() => refreshSync(false));
      }
    } catch (error) {
      showToast('Could not save locally: ' + error.message, 'error', 6000);
    } finally {
      button.disabled = false;
      $('#save-button-label').textContent = 'Save report & generate PDF';
    }
  }

  async function saveJobPatch(job) {
    const record = { ...job, updatedAt: new Date().toISOString(), worker: state.worker || job.worker };
    const localRecord = { ...record };
    updateJobInState(localRecord);
    await WeFixDB.enqueue({ jobId: record.jobId, record, photos: [], attempts: 0 });
    await WeFixDB.recordActivity('local-save', 'Updated ' + record.jobId + ' status to ' + record.status, record.jobId);
    renderAll();
    showToast('Status updated locally. Cloud sync queued.');
    if (state.token && !state.localMode && navigator.onLine) processQueue().then(() => refreshSync(false));
  }

  function resetRepairForm() {
    $('#repair-form').reset();
    state.editingJobId = ''; state.photoDrafts = []; state.existingPhotoCount = 0; state.lastPrefillPromptPhone = '';
    $('#job-id').value = '';
    $('#form-page-title').innerHTML = 'Create a <span class="accent">repair.</span>';
    $('#save-button-label').textContent = 'Save report & generate PDF';
    $('#received-date').value = new Date().toISOString().slice(0,10);
    $('#worker-name-form').value = state.worker || localStorage.getItem(cfg.WORKER_LABEL) || '';
    $('#customer-type').value = 'Customer';
    $('#repair-status').value = 'Received';
    $('#repair-priority').value = 'Normal';
    $('#device-condition').value = 'Not recorded';
    $('#payment-method').value = 'Cash';
    $('#amount-paid').value = '0';
    $('#warranty-days').value = '0';
    $('#photo-preview').innerHTML = '';
    $('#existing-customer-hint').classList.add('hidden');
    updatePaymentPreview();
  }

  function loadJobIntoForm(jobId) {
    const job = state.jobs.find(item => item.jobId === jobId);
    if (!job) { showToast('Repair record not found on this device.', 'error'); return; }
    resetRepairForm();
    state.editingJobId = job.jobId;
    const map = {
      'customer-type':'customerType','customer-name':'customerName','customer-phone':'phone','customer-alt-phone':'alternatePhone',
      'device-brand':'deviceBrand','device-model':'deviceModel','device-imei':'imei','device-condition':'deviceCondition','device-problem':'problem',
      'replaced-parts':'replacedParts','accessories':'accessories','total-amount':'totalAmount','amount-paid':'amountPaid','payment-method':'paymentMethod',
      'phone-location':'phoneLocation','device-given-to':'deviceGivenTo','repair-notes':'notes','repair-status':'status','repair-priority':'priority',
      'received-date':'receivedDate','due-date':'dueDate','warranty-days':'warrantyDays','worker-name-form':'worker'
    };
    Object.entries(map).forEach(([id,key]) => { if ($( '#' + id )) $('#' + id).value = job[key] === undefined ? '' : job[key]; });
    $('#job-id').value = job.jobId;
    $('#customer-lookup').value = job.customerName + ' — ' + job.phone;
    $('#form-page-title').innerHTML = 'Edit repair <span class="accent">report.</span>';
    $('#save-button-label').textContent = 'Update report & regenerate PDF';
    state.existingPhotoCount = Array.isArray(job.photos) ? job.photos.length : 0;
    state.photoDrafts = Array.isArray(job.localPhotos) ? job.localPhotos.map(photo => ({ name: photo.name || 'device-photo.jpg', dataUrl: photo.dataUrl })).filter(photo => photo.dataUrl) : [];
    renderPhotoPreview();
    updatePaymentPreview();
    setView('new');
  }

  function updatePaymentPreview() {
    const total = Math.max(0, Number($('#total-amount')?.value || 0));
    const paid = Math.max(0, Number($('#amount-paid')?.value || 0));
    const pending = Math.max(0, total - paid);
    $('#pending-preview').textContent = money(pending);
    const status = total > 0 && pending === 0 ? 'Paid' : paid > 0 ? 'Partially paid' : 'Unpaid';
    const pill = $('#payment-status');
    pill.textContent = status;
    pill.className = 'payment-pill ' + (status === 'Paid' ? 'paid' : status === 'Unpaid' ? 'unpaid' : 'partial');
    $('#payment-progress-bar').style.width = total > 0 ? Math.min(100, paid / total * 100) + '%' : '0%';
  }

  function detectExistingCustomer() {
    const phone = digits($('#customer-phone').value);
    if (phone.length < 7) { $('#existing-customer-hint').classList.add('hidden'); return; }
    const customer = deriveCustomers(state.jobs).find(item => digits(item.phone) === phone);
    if (!customer) { $('#existing-customer-hint').classList.add('hidden'); state.pendingPrefill = null; state.lastPrefillPromptPhone = ''; return; }
    state.pendingPrefill = customer;
    $('#existing-customer-text').textContent = `${customer.name} already has ${customer.jobs} repair record(s).`;
    $('#existing-customer-hint').classList.remove('hidden');
    if (!state.editingJobId && state.lastPrefillPromptPhone !== phone) {
      state.lastPrefillPromptPhone = phone;
      askPrefill(customer);
    }
  }
  function handleCustomerLookup() {
    const value = $('#customer-lookup').value.trim();
    const phone = digits(value);
    const customer = deriveCustomers(state.jobs).find(item => digits(item.phone) === phone || (value && (item.name + ' — ' + item.phone).toLowerCase() === value.toLowerCase()) || (value && item.name.toLowerCase() === value.toLowerCase()));
    if (customer) askPrefill(customer);
  }
  function askPrefill(customer) {
    state.pendingPrefill = customer;
    showModal({
      title: 'Existing customer found',
      subtitle: 'Reuse the saved customer information?',
      body: `<div class="detail-grid"><div class="detail-block"><label>CUSTOMER NAME</label><strong>${escapeHTML(customer.name)}</strong></div><div class="detail-block"><label>PHONE</label><strong>${escapeHTML(customer.phone)}</strong></div><div class="detail-block"><label>CUSTOMER TYPE</label><strong>${escapeHTML(customer.customerType)}</strong></div><div class="detail-block"><label>REPAIR HISTORY</label><strong>${Number(customer.jobs || 0)} reports</strong></div></div><p style="margin-top:13px">Prefilling updates the common fields only. You can still change them before saving.</p>`,
      actions: '<button class="btn btn-quiet" data-modal-action="cancel">No thanks</button><button class="btn btn-primary" data-modal-action="confirm-prefill">Prefill customer</button>'
    });
  }
  function applyCustomerPrefill(customer) {
    $('#customer-name').value = customer.name || '';
    $('#customer-phone').value = customer.phone || '';
    $('#customer-alt-phone').value = customer.alternatePhone || '';
    $('#customer-type').value = customer.customerType || 'Customer';
    $('#customer-lookup').value = (customer.name || '') + ' — ' + (customer.phone || '');
    $('#existing-customer-hint').classList.add('hidden');
    showToast('Customer details prefilled.');
  }
  function startNewJobForCustomer(customerId) {
    const customer = deriveCustomers(state.jobs).find(item => item.customerId === customerId);
    resetRepairForm();
    if (customer) applyCustomerPrefill(customer);
    setView('new');
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const room = cfg.MAX_PHOTOS_PER_JOB - state.photoDrafts.length;
    if (room <= 0) { showToast('Maximum of 4 new photos per repair.', 'error'); return; }
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await compressImage(file);
        state.photoDrafts.push({ name: file.name || 'device-photo.jpg', dataUrl });
      } catch (error) { showToast('Could not process ' + file.name + ': ' + error.message, 'error'); }
    }
    renderPhotoPreview();
  }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const maxEdge = Number(cfg.MAX_PHOTO_EDGE || 1280);
          const ratio = Math.min(1, maxEdge / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * ratio));
          canvas.height = Math.max(1, Math.round(image.height * ratio));
          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          let quality = 0.78;
          let result = canvas.toDataURL('image/jpeg', quality);
          while (result.length * 0.75 > cfg.MAX_PHOTO_BYTES && quality > 0.38) {
            quality -= 0.08; result = canvas.toDataURL('image/jpeg', quality);
          }
          URL.revokeObjectURL(url);
          if (result.length * 0.75 > cfg.MAX_PHOTO_BYTES) reject(new Error('Image remains too large after compression.'));
          else resolve(result);
        } catch (error) { URL.revokeObjectURL(url); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be opened.')); };
      image.src = url;
    });
  }
  function renderPhotoPreview() {
    const existing = state.existingPhotoCount ? `<span class="small-muted">${state.existingPhotoCount} photo(s) already stored in Drive. New photos can be added below.</span>` : '';
    $('#photo-preview').innerHTML = existing + state.photoDrafts.map((photo,index) => `<div class="photo-item"><img src="${photo.dataUrl}" alt="Device photo ${index + 1}"><button type="button" data-remove-photo="${index}" aria-label="Remove photo">×</button></div>`).join('');
    $('#photo-preview').querySelectorAll('[data-remove-photo]').forEach(btn => btn.addEventListener('click', () => { state.photoDrafts.splice(Number(btn.dataset.removePhoto),1); renderPhotoPreview(); }));
  }

  function handleJobTableClick(event) {
    const action = event.target.closest('[data-row-action]');
    if (action) {
      event.stopPropagation();
      const id = action.dataset.jobId;
      if (action.dataset.rowAction === 'edit') loadJobIntoForm(id); else openJobDetail(id);
      return;
    }
    const row = event.target.closest('[data-row-job]');
    if (row) openJobDetail(row.dataset.rowJob);
  }
  function handleCustomerGridClick(event) {
    const card = event.target.closest('[data-customer-phone]');
    if (card) openCustomerDetailByPhone(card.dataset.customerPhone);
  }
  function openJobDetail(jobId) {
    const job = state.jobs.find(item => item.jobId === jobId);
    if (!job) { showToast('Repair record is not available locally.', 'error'); return; }
    showModal({
      title: job.customerName,
      subtitle: `${job.jobId} · ${job.deviceBrand} ${job.deviceModel}`,
      wide: true,
      body: `<div class="detail-grid">
        ${detail('CUSTOMER TYPE',job.customerType)}${detail('PHONE',job.phone)}${detail('ALTERNATE PHONE',job.alternatePhone)}${detail('STATUS',job.status)}
        ${detail('DEVICE BRAND',job.deviceBrand)}${detail('DEVICE MODEL',job.deviceModel)}${detail('IMEI / SERIAL',job.imei)}${detail('DEVICE CONDITION',job.deviceCondition)}
        ${detail('REPORTED PROBLEM',job.problem)}${detail('REPLACED PARTS',job.replacedParts)}${detail('ACCESSORIES',job.accessories)}${detail('PHONE LOCATION',job.phoneLocation)}
        ${detail('DEVICE GIVEN TO',job.deviceGivenTo)}${detail('TECHNICIAN',job.worker)}${detail('RECEIVED',shortDate(job.receivedDate))}${detail('EXPECTED DELIVERY',shortDate(job.dueDate))}
        ${detail('TOTAL AMOUNT',money(job.totalAmount))}${detail('AMOUNT PAID',money(job.amountPaid))}${detail('PENDING',money(job.pendingAmount))}${detail('PAYMENT METHOD',job.paymentMethod)}
      </div><div class="detail-section-title">REPAIR NOTES</div><div class="detail-block"><strong>${escapeHTML(job.notes || 'No additional notes.')}</strong></div><div class="detail-section-title">ATTACHMENTS</div><p>${(job.photos || []).length + (job.localPhotos || []).length} photo(s) · ${(job.photos || []).length} synced to Drive · PDF ${job.pdfFileId ? 'available' : 'pending cloud save'}</p><div class="detail-section-title">QUICK STATUS UPDATE</div><select id="quick-status-select" class="control">${statuses.filter(s => s !== 'Archived').map(s => `<option ${s === job.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
      actions: `<button class="btn btn-quiet" data-modal-action="archive-job">Archive</button><button class="btn btn-secondary" data-modal-action="view-photos" ${(job.photos || []).length ? '' : 'disabled'}>◎ View photos</button><button class="btn btn-secondary" data-modal-action="download-pdf" ${job.pdfFileId ? '' : 'disabled'}>⇩ Download PDF</button><button class="btn btn-secondary" data-modal-action="edit-job">Edit report</button><button class="btn btn-primary" data-modal-action="status-save">Save status</button>`
    });
    $('#modal-root').dataset.jobId = jobId;
  }
  function detail(label, value) { return `<div class="detail-block"><label>${escapeHTML(label)}</label><strong>${escapeHTML(value || '—')}</strong></div>`; }
  function openCustomerDetailByPhone(phone) {
    const customer = deriveCustomers(state.jobs).find(item => digits(item.phone) === digits(phone));
    if (!customer) return;
    const jobs = state.jobs.filter(job => digits(job.phone) === digits(phone)).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    showModal({
      title: customer.name,
      subtitle: `${customer.customerType} · ${customer.phone} · ${jobs.length} repair records`,
      wide: true,
      body: `<div class="detail-grid">${detail('PHONE',customer.phone)}${detail('ALTERNATE PHONE',customer.alternatePhone)}${detail('CUSTOMER TYPE',customer.customerType)}${detail('TOTAL REPAIRS',jobs.length)}<div class="detail-block"><label>OUTSTANDING BALANCE</label><strong>${money(customer.totalPending)}</strong></div></div><div class="detail-section-title">REPAIR HISTORY</div>${jobs.length ? jobs.map(job => `<div class="recent-item" data-customer-job="${escapeHTML(job.jobId)}"><div class="device-avatar">▣</div><div class="recent-copy"><strong>${escapeHTML(job.deviceBrand)} ${escapeHTML(job.deviceModel)}</strong><small>${escapeHTML(job.jobId)} · ${shortDate(job.receivedDate)}</small></div><div class="recent-meta"><strong>${money(job.pendingAmount)}</strong><small><span class="status-tag ${slugStatus(job.status)}">${escapeHTML(job.status)}</span></small></div></div>`).join('') : '<p>No repair history.</p>'}`,
      actions: '<button class="btn btn-quiet" data-modal-action="cancel">Close</button><button class="btn btn-primary" data-modal-action="new-customer-job">＋ Add device / repair</button>'
    });
    $('#modal-root').dataset.customerId = customer.customerId;
    $('#modal-root').querySelectorAll('[data-customer-job]').forEach(el => el.addEventListener('click', () => { const id = el.dataset.customerJob; closeModal(); openJobDetail(id); }));
  }

  async function downloadJobPdf(jobId) {
    const job = state.jobs.find(item => item.jobId === jobId);
    if (!job || !job.pdfFileId) { showToast('PDF is not available yet. Sync the report to Drive first.', 'error'); return; }
    if (!state.token || state.localMode) { showToast('Sign in to the connected workspace to download the private Drive PDF.', 'error'); return; }
    try {
      showToast('Preparing PDF…');
      const result = await WeFixBridge.request('getAsset', { fileId: job.pdfFileId }, state.token);
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName || safeFile(job.customerName) + '.pdf';
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { showToast('PDF download failed: ' + error.message, 'error', 6000); }
  }
  async function viewJobPhotos(jobId) {
    const job = state.jobs.find(item => item.jobId === jobId);
    const photos = job && Array.isArray(job.photos) ? job.photos : [];
    if (!photos.length) { showToast('No cloud-synced photos are attached to this repair.', 'error'); return; }
    if (!state.token || state.localMode) { showToast('Sign in to view private Drive photos.', 'error'); return; }
    showModal({ title: 'Device photos', subtitle: `${job.customerName} · ${job.jobId}`, body: '<p>Loading private Drive images…</p>' });
    try {
      const items = await Promise.all(photos.map(async photo => {
        const result = await WeFixBridge.request('getAsset', { fileId: photo.fileId }, state.token);
        return { name: result.fileName || photo.name || 'Device photo', src: `data:${result.mimeType || 'image/jpeg'};base64,${result.base64}` };
      }));
      showModal({
        title: 'Device photos', subtitle: `${job.customerName} · ${job.jobId}`,
        wide: true,
        body: `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">${items.map(item => `<figure style="margin:0;padding:8px;border:1px solid var(--line);border-radius:10px"><img src="${item.src}" alt="${escapeHTML(item.name)}" style="width:100%;height:190px;object-fit:contain;background:#07111e;border-radius:7px"><figcaption style="font-size:9px;color:#90a8c1;padding:7px 2px 1px">${escapeHTML(item.name)}</figcaption></figure>`).join('')}</div>`,
        actions: '<button class="btn btn-primary" data-modal-action="cancel">Close</button>'
      });
    } catch (error) { closeModal(); showToast('Could not load photos: ' + error.message, 'error', 6000); }
  }

  async function archiveJob(jobId) {
    const job = state.jobs.find(item => item.jobId === jobId);
    if (!job) return;
    if (!window.confirm(`Archive repair ${jobId}? It will be hidden from the active register but remain in the database.`)) return;
    if (state.token && !state.localMode && navigator.onLine) {
      try {
        const result = await WeFixBridge.request('archiveRecord', { jobId }, state.token);
        state.version = Number(result.version || state.version); await WeFixDB.setMeta('serverVersion', state.version);
        removeJobFromState(jobId); showToast('Repair archived.'); renderAll(); return;
      } catch (error) { showToast('Could not archive in cloud yet: ' + error.message, 'error'); }
    }
    updateJobInState({ ...job, status: 'Archived', updatedAt: new Date().toISOString() });
    await WeFixDB.enqueue({ jobId, record: { ...job, status: 'Archived', updatedAt: new Date().toISOString() }, photos: [] });
    showToast('Archived locally.'); renderAll();
  }

  async function testConnection() {
    if (!WeFixBridge.isConfigured()) { showToast('Paste the deployed Apps Script URL into js/config.js first.', 'error'); return; }
    try {
      const result = await WeFixBridge.request('health');
      showToast(result && result.ok ? 'Apps Script bridge is reachable.' : 'Backend responded unexpectedly.', result && result.ok ? 'success' : 'error');
      updateConnectionLabels();
    } catch (error) { showToast('Connection test failed: ' + error.message, 'error', 6000); }
  }
  function saveWorkerProfile() {
    const value = $('#settings-worker').value.trim() || 'Shop worker';
    state.worker = value;
    localStorage.setItem(cfg.WORKER_LABEL, value);
    $('#user-display').textContent = value; $('#user-avatar').textContent = initials(value); $('#top-avatar').textContent = initials(value);
    $('#worker-name-form').value = value; $('#worker-name').value = value;
    const session = readSession(); if (session) { session.worker = value; saveSession(session); }
    showToast('Worker profile saved on this device.');
  }

  function handleDataActions(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'new-repair') { resetRepairForm(); setView('new'); }
    else if (action === 'view-jobs') setView('jobs');
    else if (action === 'view-customers') setView('customers');
    else if (action === 'export-data') exportJSON();
  }

  async function exportJSON() {
    const data = { app: '24x7 WEFIXIT', exportedAt: new Date().toISOString(), jobs: state.jobs, customers: deriveCustomers(state.jobs) };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'WEFIXIT-backup-' + new Date().toISOString().slice(0,10) + '.json');
    showToast('Local JSON backup downloaded.');
  }
  function exportCSV() {
    const headers = ['Job ID','Customer type','Customer name','Phone','Alternate phone','Device brand','Device model','IMEI','Problem','Replaced parts','Total amount','Amount paid','Pending amount','Status','Priority','Received date','Due date','Technician','Notes'];
    const keys = ['jobId','customerType','customerName','phone','alternatePhone','deviceBrand','deviceModel','imei','problem','replacedParts','totalAmount','amountPaid','pendingAmount','status','priority','receivedDate','dueDate','worker','notes'];
    const quote = value => '"' + String(value ?? '').replace(/"/g,'""') + '"';
    const rows = [headers.map(quote).join(','), ...state.jobs.map(job => keys.map(key => quote(job[key])).join(','))];
    downloadBlob(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'WEFIXIT-repair-register-' + new Date().toISOString().slice(0,10) + '.csv');
    showToast('CSV register downloaded.');
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  async function installApp() {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => null);
      state.installPrompt = null; $('#install-btn').classList.add('hidden');
      return;
    }
    showModal({ title: 'Install WEFIXIT', subtitle: 'Add the repair desk to your home screen.', body: '<p><b>Android Chrome:</b> Open the browser menu (⋮), then choose <em>Install app</em> or <em>Add to Home screen</em>.</p><p><b>Windows Edge / Chrome:</b> Use the install icon in the address bar, or open the browser menu and select <em>Install this site as an app</em>.</p><p>The site must be served over HTTPS, such as GitHub Pages.</p>', actions: '<button class="btn btn-primary" data-modal-action="close">Got it</button>' });
  }

  window.addEventListener('load', initialize);
})();
