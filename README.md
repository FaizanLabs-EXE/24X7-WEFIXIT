# 24×7 WEFIXIT — Mobile Repair Management Workspace

**Shop branding:** 24×7 WEFIXIT IT  
**Signature:** ╰─➤ ⚡ 𝐁𝐔𝐈𝐋𝐓 𝐁𝐘 𝐅𝐀𝐈𝐙𝐀𝐍  
**Build:** 1.0.0 · Static GitHub Pages PWA + Google Apps Script + Google Drive + Google Sheets

A local-first, installable repair-shop workspace for customer records, multi-device repair history, payments, private Drive files, PDF reports, camera images, search, and shared staff access.

> This is an original implementation of the documented mobile-repair-register workflow, not a copy of another app's source code or proprietary assets.

## 1. What is included

### Repair intake and customer history
- Customer type: Retailer / Customer.
- Customer name, primary phone, optional alternate phone.
- Device brand, model, IMEI / serial number, physical condition.
- Reported problem, replaced parts, accessories received.
- Total amount, amount paid, automatically calculated pending amount, payment method.
- Device location, staff member holding the device, technician, priority, repair status.
- Received date, expected delivery date, warranty days and internal notes.
- Camera capture / multiple image uploads (up to 4 new photos per repair; image compression before cloud upload).
- Existing customer detection by phone; staff can choose to prefill common details.
- Multiple devices and repair jobs can be attached to the same customer phone profile.
- Edit report, update status, view repair history, archive a job (soft archive; no immediate permanent deletion).

### PDF and Google Drive automation
- First setup creates `CUSTOMER REPORTS` in the shop owner's Drive, unless an optional parent folder is configured.
- A customer subfolder is created automatically. A `Device Photos` subfolder is created when needed.
- Each customer folder contains an updatable `<Customer Name>.txt` file with the customer's repair history.
- Every cloud-saved report attempts to generate a branded PDF and store it in the customer's private Drive folder.
- A repair record remains saved in Google Sheets even when PDF conversion fails; the response reports the PDF warning.
- Staff can download a generated PDF in one click from the report details.
- If the root folder was deleted, the next backend operation recreates `CUSTOMER REPORTS` and stores its new folder ID.

### Shared workspace and offline support
- One configured Apps Script endpoint is built into the published site. There is no dashboard URL editor.
- Password verification and signed session tokens run server-side. Default initial password: `WEFIXIT`.
- Each browser stores its session token locally for 90 days. Locking/logging out removes that browser's token.
- Changing the shared password in Apps Script rotates the signing secret and invalidates all existing tokens.
- Five or more workers can use the same website and shared database. The PWA syncs after writes, when returning to the app, and on a 60-second background polling interval while visible.
- IndexedDB stores local repair records and a retry queue. Writes are local-first; cloud failures are queued and retried.
- A local search filters the cached register instantly.
- PWA shell is cached for return visits. Offline records stay on that device until cloud sync succeeds.

### Dashboard and tools
- Overview metrics, recent jobs and workshop pipeline.
- Repair register with search, status/type filters and sorting.
- Customer directory with repair count and pending balance.
- Revenue, collections, pending balances and status distribution.
- Local activity log, worker profile, CSV export and JSON backup.
- Responsive Android / desktop layout, install prompt, reduced-motion support and cinematic first-entry splash.

## 2. Project structure

```text
24x7-WEFIXIT/
├── index.html
├── manifest.webmanifest
├── sw.js
├── .nojekyll
├── README.md
├── DEPLOYMENT-CHECKLIST.md
├── css/
│   └── styles.css
├── js/
│   ├── config.js       # Paste the Web App URL here once
│   ├── db.js           # IndexedDB local database + queue
│   ├── bridge.js       # Google Apps Script iframe RPC bridge
│   └── app.js          # Dashboard, forms, search, reports and PWA UI
├── assets/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── apps-script/
    ├── Code.gs
    ├── Bridge.html
    └── appsscript.json
```

## 3. One-time Google Apps Script setup

Use the Google account that owns the shop's Drive database.

1. Open [Google Apps Script](https://script.google.com/) and create a **New project**.
2. Rename the project `24x7 WEFIXIT Backend`.
3. Open the default `Code.gs`, remove its sample code, and paste the complete contents of `apps-script/Code.gs`.
4. Click **+** beside Files → **HTML**. Name the file exactly `Bridge` (without `.html`) and paste `apps-script/Bridge.html`.
5. In **Project Settings**, set the time zone to `Asia/Kolkata` (the included `appsscript.json` also records it).
6. Optional: place the generated `CUSTOMER REPORTS` folder inside a pre-existing Drive folder. Add this helper temporarily to `Code.gs`, replacing the example ID, and run it once:

   ```javascript
   function configureWeFixItParentFolder() {
     setWeFixItDriveParentFolder('PASTE_YOUR_DRIVE_FOLDER_ID');
   }
   ```

   Remove the helper afterward if you prefer. If you skip this step, the root folder is created in My Drive.

7. In the Apps Script function selector, choose **`setupWeFixIt`** and click **Run**. Approve the Google Drive and Google Sheets permissions when prompted. It creates the Drive root folder and database spreadsheet and initializes the sheets.
8. Before deploying the web app, create the GitHub Pages site using Section 4 below. Upload the project with the placeholder Apps Script URL still in `js/config.js`, enable Pages, open the HTTPS site, and copy its **origin only**. For `https://yourname.github.io/24x7-wefixit/`, the origin is `https://yourname.github.io`.
9. Add and run this helper once, replacing the example with that exact origin:

   ```javascript
   function lockWeFixItToMyWebsite() {
     setWeFixItAllowedOrigin('https://YOUR-GITHUB-USERNAME.github.io');
   }
   ```

   Remove the helper afterward. For a custom domain, use its exact HTTPS origin. The bridge refuses messages until this origin is configured.
10. Open **Deploy → New deployment**. Select type **Web app**.
11. Set **Execute as** to **Me** (the owner who authorized Drive and Sheets).
12. Set **Who has access** to **Anyone**. The public GitHub site needs to reach the web-app bridge without requiring every worker to be signed into the owner's Google account. The repair data itself stays private in the owner's Drive; only the password-protected backend can read it.
13. Click **Deploy**, authorize if asked, and copy the URL ending in `/exec`. Now complete Section 4's final URL-configuration step and test the connection.

### Optional: change the default password before publishing

The initial requested password is `WEFIXIT`. It is deliberately easy to remember but weak for a public website. Change it to a longer private passphrase before sharing the public link:

```javascript
function changeWeFixItPasswordOnce() {
  setWeFixItPassword('REPLACE_WITH_A_LONG_PRIVATE_PASSPHRASE');
}
```

Run `changeWeFixItPasswordOnce()` once from the Apps Script editor, then remove the helper. This revokes all remembered browser sessions. If you keep the requested `WEFIXIT` password, understand that anyone who knows it can access the shared shop records.

## 4. Configure the GitHub website once

1. Extract this ZIP.
2. Create a **public** GitHub repository, for example `24x7-wefixit`.
3. Upload the **contents** of this folder to the repository root (so `index.html` is at the repository root). Keep the placeholder in `js/config.js` for the first publish.
4. In GitHub, open **Settings → Pages**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
5. Open the HTTPS GitHub Pages URL after the Pages deployment finishes. Use its origin (scheme + host only) for the `setWeFixItAllowedOrigin(...)` step in Section 3.
6. After deploying the Apps Script web app in Section 3, open `js/config.js` and replace only this placeholder with the URL ending in `/exec`:

   ```javascript
   GAS_WEB_APP_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
   ```

7. Commit/push the changed `js/config.js` to the repository. The Apps Script URL is read-only in the dashboard; all workers load this same published setting. Do not paste the URL into `index.html` or `Bridge.html`.
8. Check **Settings → Test connection**. The Apps Script bridge should respond.
9. Enter the shared workspace password. Each worker should use their own browser profile/device and enter it once; the signed session is stored on that device for 90 days unless they lock out or the shop owner rotates the password.

The Web App URL is a build-time setting, not an unchangeable secret: anyone with write access to the GitHub repository can still edit `config.js` or the application code. Restrict repository write access to the shop owner/maintainer. If you change the GitHub Pages origin later, update the allow-list in Apps Script as well.

## 5. How the data is organized in Google Drive

```text
My Drive (or chosen parent folder)/
└── CUSTOMER REPORTS/
    ├── 24x7 WEFIXIT DATABASE (Google Spreadsheet)
    │   ├── Customers
    │   ├── Jobs
    │   └── Activity
    ├── Customer Name - 1234/
    │   ├── Customer Name.txt
    │   ├── Job PDF files
    │   └── Device Photos/
    └── Another Customer - 9876/
        └── ...
```

The `Jobs` sheet is the repair-job register. The `Customers` sheet stores customer identity and Drive-folder references. `Activity` tracks cloud saves and archive actions. Do not manually rename or reorder the header row in these sheets.

## 6. Quota protection — what this build does and does not do

Google Apps Script and Google Drive impose quotas. **There is no supported way to bypass, disable, or guarantee never hitting those quotas.** Google says quotas differ by account type, are per user, may change without notice, and reset 24 hours after the first request. See [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

This project reduces avoidable use by:
- Searching cached records in the browser rather than calling Apps Script for each keystroke.
- Saving a record to IndexedDB first and uploading only the queued change.
- Refreshing cloud data every 60 seconds while the app is visible, plus after saves and when a worker returns to the app.
- Avoiding continuous refresh while the tab is hidden.
- Uploading compressed photos (up to 4 per new report) rather than original camera files.
- Keeping the backend as one Apps Script project and batching sheet reads into ranges.
- Not using email, calendar, or URL Fetch services for routine repairs.

**PDFs still use Google services and consume quota.** Each successful cloud save attempts a PDF conversion and Drive file creation. At very high daily job volumes, PDF generation may need to be moved to a separately quota-managed service. If Google rejects an operation for quota, the repair row is retained and the dashboard surfaces a warning; the report can be retried by editing and saving it again.

## 7. Security notes — read before making the site public

- The GitHub website is public. Access control is provided by the Apps Script backend, not by hiding the page URL.
- `WEFIXIT` is a shared passphrase, not five individual user accounts. Worker names are labels for reports, not verified identities.
- The backend stores a salted password hash and a server-side signing secret in Script Properties; the signing secret and Drive IDs are not exposed in the public frontend.
- The Apps Script iframe bridge accepts messages only from the exact HTTPS origin saved with `setWeFixItAllowedOrigin(...)`. The web app still uses `ALLOWALL` for framing, but unrelated origins cannot use the bridge because their messages are rejected.
- The browser receives a signed, expiring session token. It is stored in localStorage on that browser. Do not use a shared/public computer without locking the app afterward.
- Drive files are **not** set to **Anyone with the link**. The app fetches PDFs and photos through the authenticated backend so private customer data is not made public.
- Limit GitHub repository write access. The configured Apps Script URL is locked from the UI, but a repository writer can edit `config.js` or application code.
- Do not store OTPs, bank PINs, customer credentials, or phone unlock passwords in notes or IMEI fields.
- Anyone who receives the shared password can access the shared workspace. Rotate it in Apps Script immediately if a worker leaves or the password is exposed.

## 8. Sync behavior and expectations

This is near-real-time polling, not a WebSocket push service. A successful save is sent immediately when online; other workers normally see the change on their next 60-second sync, after focusing the app, or when they press **Sync now**. Offline saves remain in that browser's retry queue until it reconnects. The same browser's IndexedDB is not the shared database; the Apps Script spreadsheet is the shared source of truth.

For reliability, use the same published GitHub Pages link for all staff. A worker who opens a different browser/device will need to sign in there once too.

## 9. Test checklist before shop use

- [ ] Run `setupWeFixIt()` and confirm `CUSTOMER REPORTS` and the spreadsheet exist.
- [ ] Deploy the web app as **Execute as Me / Anyone**.
- [ ] Paste `/exec` into `js/config.js`, publish GitHub Pages over HTTPS.
- [ ] Test login from a second browser/device.
- [ ] Create one repair, verify the row in `Jobs`, customer row in `Customers`, TXT file and PDF in Drive.
- [ ] Add another device using the same customer phone; verify it reuses the customer profile and creates a second job.
- [ ] Edit the first job and verify the changes and new PDF.
- [ ] Upload a small phone photo and verify it appears in the customer's `Device Photos` folder.
- [ ] Download a PDF using the report detail window.
- [ ] Take one device offline, save a test record, reconnect, and verify it syncs.
- [ ] Confirm a second worker sees a saved job after syncing.
- [ ] Install the PWA on Android/Windows and test the layout.
- [ ] Change the shared password once and confirm previously saved sessions are rejected.

## 10. Known boundaries

- No software can promise zero bugs on every browser, Google account, network or future Apps Script change. Test with the shop's actual deployment before entering live customer data.
- The Google Sheets backend is suitable for a small repair shop and moderate traffic, not an unlimited high-volume multi-branch ERP. The initial sync is capped at 5,000 jobs.
- If the owner deletes the Drive root folder, it will be recreated on the next write; existing deleted files cannot be restored automatically.
- If a worker clears browser data or changes devices, unsynced local-only records on that browser may be lost. Wait for the queue counter to reach zero before clearing storage.
- This app does not provide verified per-user roles, payment-gateway integration, WhatsApp messaging, or server-push notifications.

---

**╰─➤ ⚡ 𝐁𝐔𝐈𝐋𝐓 𝐁𝐘 𝐅𝐀𝐈𝐙𝐀𝐍**  
24×7 WEFIXIT IT · Repair workspace
