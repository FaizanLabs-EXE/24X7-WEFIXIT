/* Local-first IndexedDB storage. No external library required. */
(function () {
  'use strict';
  const cfg = window.WEFIXIT_CONFIG;
  const DB_NAME = cfg.DB_NAME;
  const DB_VERSION = 1;
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'jobId' });
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'jobId' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('activity')) db.createObjectStore('activity', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local database.'));
      request.onblocked = () => reject(new Error('Local database upgrade is blocked by another open WEFIXIT tab.'));
    });
    return dbPromise;
  }

  async function transaction(storeName, mode, callback) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try { result = callback(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
      tx.onerror = () => reject(tx.error || new Error('Local database transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Local database transaction was cancelled.'));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local database request failed.'));
    });
  }

  const api = {
    open: openDB,
    async put(store, value) { return transaction(store, 'readwrite', s => s.put(value)); },
    async get(store, key) { return requestValue((await openDB()).transaction(store, 'readonly').objectStore(store).get(key)); },
    async all(store) { return requestValue((await openDB()).transaction(store, 'readonly').objectStore(store).getAll()); },
    async remove(store, key) { return transaction(store, 'readwrite', s => s.delete(key)); },
    async clear(store) { return transaction(store, 'readwrite', s => s.clear()); },
    async setMeta(key, value) { return this.put('meta', { key, value }); },
    async getMeta(key, fallback = null) { const item = await this.get('meta', key); return item ? item.value : fallback; },
    async enqueue(job) { return this.put('queue', { ...job, queuedAt: new Date().toISOString(), attempts: Number(job.attempts || 0) }); },
    async queued() { return this.all('queue'); },
    async recordActivity(type, message, jobId) {
      const item = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, message, jobId: jobId || '', at: new Date().toISOString() };
      await this.put('activity', item);
      const all = await this.all('activity');
      if (all.length > 250) {
        all.sort((a, b) => new Date(a.at) - new Date(b.at));
        for (const old of all.slice(0, all.length - 250)) await this.remove('activity', old.id);
      }
      return item;
    }
  };
  window.WeFixDB = api;
})();
