import type { RoadAlert } from '@/types';

export interface AlertMetaFields {
  title?: string | null;
  reference?: string | null;
  block_ar?: string | null;
  street_ar?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}

export function alertReference(alert: AlertMetaFields): string | null {
  return alert.reference ?? (typeof alert.metadata?.reference === 'string' ? alert.metadata.reference : null);
}

export function alertBlock(alert: AlertMetaFields): string | null {
  return alert.block_ar ?? (typeof alert.metadata?.block_ar === 'string' ? alert.metadata.block_ar : null);
}

export function alertStreet(alert: AlertMetaFields): string | null {
  return alert.street_ar ?? (typeof alert.metadata?.street_ar === 'string' ? alert.metadata.street_ar : null);
}

export function alertNeighborhood(alert: AlertMetaFields): string | null {
  return typeof alert.metadata?.neighborhood_ar === 'string' ? alert.metadata.neighborhood_ar : null;
}

export function alertSpeedLine(alert: AlertMetaFields): string | null {
  const speed = alert.metadata?.speed_kmh ?? alert.metadata?.speed;
  const limit = alert.metadata?.speed_limit_kmh ?? alert.metadata?.speed_limit;
  if (typeof speed !== 'number' || typeof limit !== 'number') return null;
  return `${Math.round(speed)} كم/س · حد ${Math.round(limit)}`;
}

export function isSpeedViolationAlert(alert: { event_type?: string; metadata?: Record<string, unknown> }): boolean {
  return alert.event_type === 'traffic_violation'
    || alert.metadata?.violation_type === 'speed';
}

/** AI confidence applies to vision detections only — not GPS speed violations */
export function showsAiConfidence(alert: { event_type?: string; metadata?: Record<string, unknown> }): boolean {
  return !isSpeedViolationAlert(alert);
}

export function alertLocationLine(alert: AlertMetaFields): string | null {
  const parts = [alertBlock(alert), alertStreet(alert)].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return alertNeighborhood(alert);
}

export function alertPopupLines(alert: AlertMetaFields): { title: string; subtitle: string } {
  const title = alert.title ?? alertLocationLine(alert) ?? alertReference(alert) ?? 'تنبيه';
  const loc = alertLocationLine(alert);
  const parts = [
    loc && loc !== title ? loc : null,
    alertReference(alert),
    alertSpeedLine(alert),
    showsAiConfidence(alert) && alert.confidence != null ? `ثقة ${Math.round(alert.confidence * 100)}%` : null,
  ].filter(Boolean);
  return { title, subtitle: parts.join(' · ') };
}

export type { RoadAlert };
