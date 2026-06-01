import type { CSSProperties } from 'react';
import type { NearbyEvent } from '../lib/api';
import { getEventMeta, type EventMeta } from '../lib/eventMeta';
import { formatDistanceKm } from '../lib/mapGeo';

interface Props {
  title: string;
  sub: string;
  online: boolean;
  vehicle: string;
  events: NearbyEvent[];
  classMeta: Record<string, EventMeta>;
  locating: boolean;
  follow: boolean;
  onLocate: () => void;
  onFollow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function MapChrome({
  title,
  sub,
  online,
  vehicle,
  events,
  classMeta,
  locating,
  follow,
  onLocate,
  onFollow,
  onZoomIn,
  onZoomOut,
}: Props) {
  const sorted = [...events].sort((a, b) => a.distance_km - b.distance_km);

  return (
    <div className="nx-map-ui">
      <header className="nx-map-ui__head">
        <div className="nx-map-ui__place">
          <span>📍</span>
          <div>
            <strong>{title}</strong>
            {sub && <small>{sub}</small>}
          </div>
        </div>
        <div className="nx-map-ui__tags">
          <span className={online ? ' nx-map-ui__tag--ok' : ''}>{online ? 'ONLINE' : 'OFFLINE'}</span>
          <span>{vehicle}</span>
        </div>
      </header>

      <div className="nx-map-ui__ctrl">
        <button type="button" onClick={onZoomIn} aria-label="+">+</button>
        <button type="button" onClick={onZoomOut} aria-label="-">−</button>
        <button type="button" className="nx-map-ui__gps" onClick={onLocate} disabled={locating}>◎</button>
        {!follow && (
          <button type="button" className="nx-map-ui__follow" onClick={onFollow}>متابعة</button>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="nx-map-ui__events">
          {sorted.slice(0, 8).map((ev) => {
            const m = getEventMeta(ev.event_type, classMeta);
            return (
              <article key={ev.id} className="nx-map-ev" style={{ '--c': m.color } as CSSProperties}>
                <span>{m.icon}</span>
                <div>
                  <strong>{m.labelAr}</strong>
                  <em>{formatDistanceKm(ev.distance_km)}</em>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
