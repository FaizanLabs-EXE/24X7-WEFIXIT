# WEFIXIT — Go-live checklist

## Backend
- [ ] Apps Script project contains `Code.gs`, `Bridge.html` and the V8 runtime manifest.
- [ ] `setupWeFixIt()` ran successfully under the shop owner's Google account.
- [ ] Owner authorized Drive and Sheets access.
- [ ] `CUSTOMER REPORTS` and the WEFIXIT database spreadsheet were created.
- [ ] GitHub Pages HTTPS origin is saved with `setWeFixItAllowedOrigin(...)` before deployment.
- [ ] Web app deployment uses **Execute as: Me** and **Access: Anyone**.
- [ ] `/exec` URL copied exactly.
- [ ] Optional: replace `WEFIXIT` with a strong shared passphrase.

## Frontend
- [ ] `js/config.js` has the `/exec` URL, with quotes intact.
- [ ] All project files are at the GitHub repository root.
- [ ] GitHub Pages publishes from `main` / root.
- [ ] `js/config.js` contains the exact Apps Script `/exec` URL.
- [ ] HTTPS site opens without 404 errors.
- [ ] Settings → Test connection succeeds.
- [ ] Login succeeds; a bad password is rejected.

## End-to-end verification
- [ ] Create a test customer and repair report.
- [ ] Confirm local record appears immediately.
- [ ] Confirm Jobs and Customers spreadsheet rows.
- [ ] Confirm `<Customer Name>.txt` exists in the customer folder.
- [ ] Confirm job PDF exists and downloads in the dashboard.
- [ ] Confirm optional photos upload to Device Photos.
- [ ] Add a second device with the same phone number; verify customer reuse.
- [ ] Edit a report, change its status, and check the refreshed PDF.
- [ ] Test two browsers/devices and verify shared sync.
- [ ] Test offline save + reconnect queue.
- [ ] Install PWA on Android and Windows.

## Security
- [ ] Only the shop owner can write to the GitHub repository.
- [ ] Drive folder is not shared publicly.
- [ ] Do not record customer OTPs or device unlock passwords.
- [ ] Workers lock their browser session before leaving shared devices.
