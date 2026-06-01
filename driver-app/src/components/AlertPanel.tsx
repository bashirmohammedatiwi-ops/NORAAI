import type { CSSProperties } from 'react';
import type { NearbyEvent } from '../lib/api';
import { getEventMeta, type EventMeta } from '../lib/eventMeta';

interface Alert {
  id: string;
  type: string;
  label: string;
  confidence: number;
}

interface Props {
  alerts: Alert[];
  nearby: NearbyEvent[];
  open: boolean;
  floating: boolean;
  onToggle: () => void;
  classMeta: Record<string, EventMeta>;
}

export default function AlertPanel({ alerts, nearby, open, floating, onToggle, classMeta }: Props) {
  const total = alerts.length + nearby.length;

  return (
    <>
      {floating && !open && total > 0 && (
        <button type="button" className="nx-alert-tab" onClick={onToggle}>
          {total} تنبيه
        </button>
      )}

      <aside className={`nx-alert${open ? ' nx-alert--open' : ''}${floating ? ' nx-alert--float' : ''}`}>
        <header className="nx-alert__head">
          <h2>التنبيهات</h2>
          {floating && (
            <button type="button" className="nx-alert__x" onClick={onToggle} aria-label="إغلاق">✕</button>
          )}
        </header>

        <section>
          <h3>مباشر</h3>
          {alerts.length === 0 && <p className="nx-alert__empty">لا شيء</p>}
          {alerts.map((a) => {
            const m = getEventMeta(a.label || a.type, classMeta);
            return (
              <article key={a.id} className="nx-alert__item" style={{ '--c': m.color } as CSSProperties}>
                <span>{m.icon}</span>
                <div><strong>{m.labelAr}</strong><small>{Math.round(a.confidence * 100)}%</small></div>
              </article>
            );
          })}
        </section>

        <section>
          <h3>قريب</h3>
          {nearby.length === 0 && <p className="nx-alert__empty">لا أحداث</p>}
          {nearby.slice(0, 12).map((e) => {
            const m = getEventMeta(e.event_type, classMeta);
            return (
              <article key={e.id} className="nx-alert__row">
                <span style={{ color: m.color }}>{m.icon}</span>
                <strong>{m.labelAr}</strong>
                <em>{e.distance_km} km</em>
              </article>
            );
          })}
        </section>
      </aside>
    </>
  );
}
