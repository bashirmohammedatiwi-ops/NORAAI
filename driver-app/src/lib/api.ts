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
  class_name?: string;
}

export interface ProjectClass {
  id: string;
  name: string;
  color: string;
}

export interface ServerConfig {
  project_id: string;
  device_id: string;
  vehicle_id: string;
  model_ready: boolean;
  model_name: string | null;
  model_classes: string[];
  project_classes: ProjectClass[];
  classes: string[];
  alert_types: AlertType[];
  speed_limit_kmh: number;
  road_speed_enabled: boolean;
  detection_enabled: boolean;
  message: string | null;
  scan_interval_ms?: number;
  scan_interval_fast_ms?: number;
  speed_fast_kmh?: number;
  capture_max_width?: number;
  jpeg_quality?: number;
}

export interface RoadSpeedLimit {
  speed_limit_kmh: number;
  source: 'google' | 'osm' | 'osm_inferred' | 'fallback' | 'default' | string;
  road_speed_available: boolean;
  place_id: string | null;
  road_name: string | null;
  highway_type: string | null;
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
  alerts: { type: string; label: string; class_name?: string; confidence: number; speed?: number; speed_limit?: number }[];
  events_created: number;
  model_ready: boolean;
  message: string | null;
  latency_ms?: number | null;
  pipeline?: string | null;
}

export async function warmupModel(config: DriverConfig): Promise<void> {
  const res = await fetch(`${baseUrl(config)}/api/v1/driver/warmup`, {
    method: 'POST',
    headers: headers(config),
  });
  if (!res.ok) await parseError(res);
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

export async function fetchRoadSpeedLimit(
  config: DriverConfig,
  lat: number,
  lon: number,
  fallback = 80
): Promise<RoadSpeedLimit> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    fallback: String(fallback),
  });
  const res = await fetch(`${baseUrl(config)}/api/v1/driver/speed-limit?${q}`, { headers: headers(config) });
  if (!res.ok) await parseError(res);
  return res.json();
}
