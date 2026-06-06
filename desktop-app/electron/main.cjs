const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let stackProc = null;
let mainWindow = null;

function noraiRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'norai');
  }
  return path.resolve(__dirname, '..', '..');
}

function pythonExe(root) {
  return path.join(root, 'backend', '.venv', 'Scripts', 'python.exe');
}

function waitForHealth(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(3000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Backend did not start in time'));
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
  });
}

function startStack(root) {
  const py = pythonExe(root);
  const script = path.join(root, 'backend', 'launcher', 'run_stack.py');
  const env = { ...process.env, NORAAI_ROOT: root };
  stackProc = spawn(py, [script], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  stackProc.stdout.on('data', (d) => process.stdout.write(`[norai] ${d}`));
  stackProc.stderr.on('data', (d) => process.stderr.write(`[norai] ${d}`));
  stackProc.on('exit', (code) => {
    if (code && code !== 0) {
      dialog.showErrorBox('NORAAI', `Backend exited with code ${code}`);
    }
    stackProc = null;
  });
}

function stopStack() {
  if (stackProc && !stackProc.killed) {
    try {
      stackProc.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
  }
  stackProc = null;
}

async function createWindow() {
  const root = noraiRoot();
  const py = pythonExe(root);
  if (!require('fs').existsSync(py)) {
    dialog.showErrorBox(
      'NORAAI',
      'Backend not found. Run scripts\\build_desktop_exe.ps1 first.'
    );
    app.quit();
    return;
  }

  startStack(root);
  try {
    await waitForHealth('http://127.0.0.1:8000/health');
  } catch (err) {
    dialog.showErrorBox('NORAAI', err.message || String(err));
    stopStack();
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'NORAAI',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL('http://127.0.0.1:8000');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('before-quit', stopStack);
app.on('window-all-closed', () => {
  stopStack();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
