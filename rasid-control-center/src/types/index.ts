export type AlertRecipient = 'ambulance' | 'police' | 'municipality' | 'traffic' | 'fleet' | 'public';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type EventType =
  | 'accident'
  | 'pothole'
  | 'speed_bump'
  | 'manhole'
  | 'road_crack'
  | 'barrier'
  | 'road_closed'
  | 'traffic_violation'
  | 'construction'
  | 'flooded_road';

export interface RoadAlert {
  id: string;
  event_type: EventType;
  latitude: number;
  longitude: number;
  confidence: number | null;
  is_active: boolean;
  created_at: string;
  resolved_at: string | null;
  device_id: string | null;
  recipient: AlertRecipient;
  municipality_id?: string | null;
  severity: AlertSeverity;
  image_url?: string | null;
  title?: string | null;
  reference?: string | null;
  block_ar?: string | null;
  street_ar?: string | null;
  vehicle_id?: string | null;
  metadata?: Record<string, unknown>;
  action?: 'created' | 'resolved';
}

export interface FleetDevice {
  id: string;
  device_id: string;
  vehicle_id: string;
  driver_name?: string | null;
  phone_number?: string | null;
  is_online: boolean;
  gps_status: string;
  camera_status: string;
  latitude: number | null;
  longitude: number | null;
  last_communication: string | null;
}

export interface ControlOverview {
  active_alerts: number;
  critical_alerts: number;
  vehicles_online: number;
  vehicles_total: number;
  resolved_total: number;
  by_recipient: Record<string, number>;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  by_municipality: Record<string, number>;
  recent_alerts: RoadAlert[];
}

export interface ModelArtifact {
  id: string;
  name: string;
  architecture: string;
  lifecycle: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface NotificationItem extends RoadAlert {
  read: boolean;
  message: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  default_project_id?: string | null;
}

export interface RoadStats {
  total_vehicles_reporting: number;
  total_devices: number;
  active_accidents: number;
  closed_roads: number;
  potholes_detected: number;
  manholes_detected?: number;
  speed_bumps_detected: number;
  municipality_alerts: number;
  traffic_violations: number;
  road_issues_detected: number;
  active_model: {
    ready: boolean;
    name: string | null;
    architecture: string | null;
  };
}

export interface IntegrationStatus {
  id: string;
  name: string;
  kind: string;
  status: 'connected' | 'ready' | 'offline' | 'error' | 'needs_key';
  detail?: string | null;
}

export interface SystemStatus {
  version: string;
  service: string;
  database: { status: string };
  redis: { status: string };
  lab: {
    configured: boolean;
    api_key_configured: boolean;
    endpoint_label: string;
    url_host: string | null;
  };
  websocket: { path: string; status: string };
  active_model: { ready: boolean; name: string | null; architecture: string | null };
  fleet: { online: number; total: number };
  integrations: IntegrationStatus[];
}
