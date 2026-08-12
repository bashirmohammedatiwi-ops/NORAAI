import type { RoadAlert } from '@/types';
import { guessGovernorate } from '@/lib/constants';

export function alertsByHour(alerts: RoadAlert[]): { hour: string; events: number }[] {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, events: 0 }));
  for (const a of alerts) {
    const d = new Date(a.created_at);
    if (Number.isNaN(d.getTime())) continue;
    buckets[d.getHours()].events += 1;
  }
  return buckets;
}

export function avgConfidence(alerts: RoadAlert[]): number | null {
  const vals = alerts
    .filter((a) => a.event_type !== 'traffic_violation')
    .map((a) => a.confidence)
    .filter((c): c is number => c != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100);
}

export function resolveRate(alerts: RoadAlert[]): number {
  if (!alerts.length) return 0;
  const resolved = alerts.filter((a) => !a.is_active).length;
  return Math.round((resolved / alerts.length) * 100);
}

export function alertsLast24h(alerts: RoadAlert[]): RoadAlert[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return alerts.filter((a) => new Date(a.created_at).getTime() >= cutoff);
}

export function govAlertCounts(alerts: RoadAlert[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of alerts) {
    const id = a.municipality_id ?? guessGovernorate(a.latitude, a.longitude);
    map[id] = (map[id] ?? 0) + 1;
  }
  return map;
}

export function severityBreakdown(alerts: RoadAlert[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of alerts) {
    map[a.severity] = (map[a.severity] ?? 0) + 1;
  }
  return map;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
