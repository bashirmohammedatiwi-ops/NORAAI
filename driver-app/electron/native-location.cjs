const { execFile } = require('child_process');
const path = require('path');

const PS_SCRIPT = path.join(__dirname, 'windows-location.ps1');

function getWindowsNativeLocation(timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const text = (stdout || '').trim();
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }

        if (parsed?.lat != null && parsed?.lon != null) {
          resolve({
            lat: parsed.lat,
            lon: parsed.lon,
            accuracy: Number.isFinite(parsed.accuracy) ? parsed.accuracy : null,
            speed: Number.isFinite(parsed.speed) ? parsed.speed * 3.6 : null,
            heading: Number.isFinite(parsed.heading) ? parsed.heading : null,
          });
          return;
        }

        if (parsed?.error === 'denied') {
          reject(Object.assign(new Error(parsed.message || 'Location denied'), { code: 'denied' }));
          return;
        }

        reject(
          Object.assign(new Error(parsed?.message || stderr || error?.message || 'Location unavailable'), {
            code: parsed?.error || 'unavailable',
          })
        );
      }
    );
  });
}

function getNativeLocation(timeoutMs = 45000) {
  if (process.platform === 'win32') {
    return getWindowsNativeLocation(timeoutMs);
  }
  return Promise.reject(Object.assign(new Error('Native location not supported on this platform'), { code: 'unsupported' }));
}

module.exports = { getNativeLocation };
