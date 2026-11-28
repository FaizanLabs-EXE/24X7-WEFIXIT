/*
 * 24x7 WEFIXIT — deployment configuration
 * Paste the owner's deployed Google Apps Script Web App URL below ONCE,
 * then commit/publish this file. The dashboard intentionally has no URL editor.
 */
window.WEFIXIT_CONFIG = Object.freeze({
  GAS_WEB_APP_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
  APP_VERSION: "1.0.0",
  SHOP_NAME: "24×7 WEFIXIT IT",
  SYNC_INTERVAL_MS: 60000,
  SESSION_LABEL: "wefixit_session_v1",
  WORKER_LABEL: "wefixit_worker_v1",
  DB_NAME: "wefixit_local_v1",
  MAX_PHOTOS_PER_JOB: 4,
  MAX_PHOTO_EDGE: 1280,
  MAX_PHOTO_BYTES: 450000,
  MAX_QUEUE_RETRIES: 8
});
