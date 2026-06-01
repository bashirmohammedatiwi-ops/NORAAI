import type { CSSProperties } from 'react';
import SpeedGauge from './SpeedGauge';

interface Props {
  speed: number | null;
  limit: number;
  limitLabel?: string;
  limitFromRoad?: boolean;
  place: string;
  sub: string;
  online: boolean;
  vehicle: string;
  scanning: boolean;
  hazard?: { icon: string; label: string; dist: string; color: string };
}

export default function DashBar({
  speed,
  limit,
  limitLabel,
  limitFromRoad,
  place,
  sub,
  online,
  vehicle,
  scanning,
  hazard,
}: Props) {
  const time = new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

  return (
    <footer className="nx-dash">
      <div className="nx-dash__speed">
        <SpeedGauge speed={speed} limit={limit} limitLabel={limitLabel} fromRoad={limitFromRoad} variant="dash" />
      </div>

      <div className="nx-dash__info">
        <p className="nx-dash__label">الموقع</p>
        <h2>{place}</h2>
        {sub && <small>{sub}</small>}
      </div>

      {hazard && (
        <div className="nx-dash__hazard" style={{ '--hz': hazard.color } as CSSProperties}>
          <span>{hazard.icon}</span>
          <div>
            <p>أقرب حدث</p>
            <strong>{hazard.label}</strong>
            <em>{hazard.dist}</em>
          </div>
        </div>
      )}

      <div className="nx-dash__meta">
        <span className="nx-dash__time">{time}</span>
        <span className="nx-dash__veh">{vehicle}</span>
        <div className="nx-dash__signals">
          <b className={online ? ' nx-dash__sig--on' : ''} />
          {scanning && <span className="nx-dash__ai">AI</span>}
        </div>
      </div>
    </footer>
  );
}
