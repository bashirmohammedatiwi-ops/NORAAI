export interface DriverConfig {
  serverUrl: string;
  projectId: string;
  deviceId: string;
  apiKey: string;
  vehicleId: string;
  speedLimit: number;
}

const KEY = 'norai_driver_config';

export function loadConfig(): DriverConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: DriverConfig) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}
