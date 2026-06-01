const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const { getNativeLocation } = require('./native-location.cjs');

const isDev = !app.isPackaged;

const ALLOWED_PERMISSIONS = new Set(['geolocation', 'media', 'mediaKeySystem', 'notifications']);

function setupPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'geolocation') {
      callback(true);
      return;
    }
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'geolocation') return true;
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

  return win;
}

ipcMain.handle('open-location-settings', async () => {
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:privacy-location');
    return true;
  }
  if (process.platform === 'darwin') {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices');
    return true;
  }
  return false;
});

ipcMain.handle('get-native-location', async () => {
  try {
    return { ok: true, ...(await getNativeLocation()) };
  } catch (err) {
    return {
      ok: false,
      code: err.code === 'denied' ? 'denied' : 'unavailable',
      message: err.message || 'Location unavailable',
    };
  }
});

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
