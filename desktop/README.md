# Career Buddha 360 Suite — Desktop App

A lightweight Windows desktop wrapper (Electron) that opens the Career Buddha 360
Suite web app in its own window with the Career Buddha icon — no browser bars.

## What the desktop app does
- Opens the live Career Buddha 360 Suite in a dedicated desktop window.
- Shows the Career Buddha logo on the window and taskbar.
- Opens external links (LinkedIn, etc.) in the user's default browser.
- All data stays in the same shared backend — the desktop app is just a window
  onto the same system everyone uses.

## Which URL it opens
Set in `main.js` → `APP_URL`. For the final build this should be the permanent
production URL. You can also override at runtime with the `CB_APP_URL` env var.

---

## Option A — Portable ZIP (ready now)
Download link (served by the app's backend while the preview is running):

    <YOUR_APP_URL>/api/desktop/windows

1. Download `CareerBuddha360Suite-Windows.zip`.
2. Unzip anywhere (e.g. Desktop).
3. Open the folder and double-click **`Career Buddha 360 Suite.exe`**.
4. (Optional) Right-click the .exe → *Send to → Desktop (create shortcut)*.

No installation needed. Share the ZIP with team members the same way.
> Note: the portable .exe file icon in Windows Explorer shows the default
> Electron icon; the Career Buddha logo appears on the running window/taskbar.
> For a fully branded installer with the icon embedded, use Option B.

---

## Option B — Proper branded installer (recommended)
This produces a real `Setup .exe` installer with the Career Buddha icon embedded,
**and enables in-app auto-update**. It must be built on Windows (done automatically
via GitHub Actions):

1. In Emergent, use **"Save to GitHub"** to push this project.
2. On GitHub: **Actions → "Build Windows Desktop App" → Run workflow**.
3. When done, open the run and download the **CareerBuddha360Suite-Installer**
   artifact — it contains the installer `.exe` you can share with your team.

### Auto-update (keeps the team on the latest version)
The app checks GitHub Releases on launch and installs updates automatically
(`electron-updater`, configured via the `publish: github` block in package.json).

To ship an update everyone receives automatically:
1. Bump `"version"` in `desktop/package.json` (e.g. `1.0.1`).
2. Commit, then push a tag starting with `desktop-v` (e.g. `desktop-v1.0.1`).
3. The workflow builds and **publishes a GitHub Release**. Installed apps detect
   it on next launch, download in the background, and prompt the user to restart.

> Auto-update works only with the installer (Option B), not the portable ZIP.

### Build locally on a Windows PC (alternative)
```
cd desktop
npm install
npx electron-builder --win --x64
```
The installer is written to `desktop/release/`.
