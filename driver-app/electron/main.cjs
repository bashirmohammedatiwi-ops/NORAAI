const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

const ALLOWED_PERMISSIONS = new Set(['geolocation', 'media', 'mediaKeySystem', 'notifications']);

function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5174');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
