import type { DriverConfig } from './storage';

function baseUrl(config: DriverConfig) {
  return config.serverUrl.replace(/\/$/, '');
}

function headers(config: DriverConfig) {
  return { 'X-Device-Key': config.apiKey };
}

export interface AlertType {
  type: string;
  label: string;
  label_ar: string;
  color: string;
}

export interface ServerConfig {
  project_id: string;
  device_id: string;
  vehicle_id: string;
  model_ready: boolean;
  model_name: string | null;
  classes: string[];
  alert_types: AlertType[];
  speed_limit_kmh: number;
}

export interface NearbyEvent {
  id: string;
  event_type: string;
  latitude: number;
  longitude: number;
  confidence: number | null;
  distance_km: number;
}

export interface DetectResult {
  detections: { class: string; event_type: string | null; confidence: number; bbox?: number[] }[];
  alerts: { type: string; label: string; confidence: number; speed?: number; speed_limit?: number }[];
  events_created: number;
}

async function parseError(res: Response) {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  throw new Error(typeof err.detail === 'string' ? err.detail : 'Request failed');
}

export async function fetchConfig(config: DriverConfig): Promise<ServerConfig> {
  const res = await fetch(`${baseUrl(config)}/api/v1/driver/config`, { headers: headers(config) });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function sendTelemetry(
  config: DriverConfig,
  data: { latitude: number; longitude: number; speed: number | null; gps_status: string; camera_status: string }
) {
  const res = await fetch(`${baseUrl(config)}/api/v1/driver/telemetry`, {
    method: 'POST',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function detectFrame(
  config: DriverConfig,
  blob: Blob,
  data: { latitude: number; longitude: number; speed: number | null; speed_limit: number }
): Promise<DetectResult> {
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  form.append('latitude', String(data.latitude));
  form.append('longitude', String(data.longitude));
  form.append('speed_limit', String(data.speed_limit));
  if (data.speed != null) form.append('speed', String(data.speed));

  const res = await fetch(`${baseUrl(config)}/api/v1/driver/detect`, {
    method: 'POST',
    headers: headers(config),
    body: form,
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function fetchNearby(
  config: DriverConfig,
  lat: number,
  lon: number,
  radiusKm = 10
): Promise<NearbyEvent[]> {
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), radius_km: String(radiusKm) });
  const res = await fetch(`${baseUrl(config)}/api/v1/driver/events/nearby?${q}`, { headers: headers(config) });
  if (!res.ok) await parseError(res);
  return res.json();
}
