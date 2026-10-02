const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// The web app this desktop wrapper opens.
// Updated to the permanent production URL for the final build.
const APP_URL = process.env.CB_APP_URL || 'https://careerbuddha.emergent.host';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Career Buddha 360 Suite',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(APP_URL);

  // Open target=_blank / external links in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Keep in-app navigation inside the window; send off-domain nav to browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const appHost = new URL(APP_URL).host;
      const target = new URL(url).host;
      if (target !== appHost) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (e) { /* ignore */ }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Minimal app menu with reload / quit / zoom shortcuts.
function buildMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Check GitHub Releases for a newer version and auto-install on quit.
function initAutoUpdate() {
  if (!app.isPackaged) return; // skip in dev / portable-from-source
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update available',
      message: `Career Buddha 360 Suite ${info.version} is ready.`,
      detail: 'Restart to install the latest version.'
    }).then((res) => {
      if (res.response === 0) autoUpdater.quitAndInstall();
    });
  });
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err == null ? 'unknown' : (err.message || err));
  });
  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (e) {
    console.error('checkForUpdates failed:', e);
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  initAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
