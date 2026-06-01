import { useEffect, useId, useState } from 'react';

interface Props {
  speed: number | null;
  limit: number;
  limitLabel?: string;
  fromRoad?: boolean;
  variant?: 'dash' | 'mini';
}

const START = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, a: number, b: number) {
  const s = polar(cx, cy, r, a);
  const e = polar(cx, cy, r, b);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function color(ratio: number) {
  if (ratio >= 1) return '#ef4444';
  if (ratio >= 0.92) return '#f97316';
  if (ratio >= 0.78) return '#eab308';
  return '#0d9488';
}

export default function SpeedGauge({ speed, limit, limitLabel, fromRoad, variant = 'dash' }: Props) {
  const uid = useId().replace(/:/g, '');
  const [v, setV] = useState<number | null>(null);

  useEffect(() => {
    if (speed == null) return;
    setV((p) => (p == null ? speed : p + (speed - p) * 0.3));
  }, [speed]);

  const ok = v != null;
  const n = ok ? Math.round(v) : null;
  const ratio = ok && limit > 0 ? v / limit : 0;
  const c = ok ? color(ratio) : '#666';
  const over = ok && ratio >= 1;

  if (variant === 'mini') {
    const pct = Math.min(ratio, 1.15) * 100;
    return (
      <div className={`nx-mini-speed${over ? ' nx-mini-speed--over' : ''}`}>
        <strong style={{ color: ok ? c : '#888' }}>{n ?? '--'}</strong>
        <span>km/h</span>
        <div className="nx-mini-speed__bar"><i style={{ width: `${Math.min(pct, 100)}%`, background: c }} /></div>
        <em>{limit}</em>
      </div>
    );
  }

  const W = 260;
  const H = 160;
  const cx = W / 2;
  const cy = H - 10;
  const r = 110;
  const stroke = 12;
  const bg = arc(cx, cy, r, START, START + SWEEP);
  const len = (SWEEP / 360) * 2 * Math.PI * r;
  const prog = len * Math.min(ratio, 1.12);
  const gid = `g${uid}`;

  return (
    <div className={`nx-speed${over ? ' nx-speed--over' : ''}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c} />
            <stop offset="100%" stopColor={c} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <path d={bg} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={stroke} strokeLinecap="round" />
        {ok && (
          <path
            d={bg}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${prog} ${len}`}
          />
        )}
      </svg>
      <div className="nx-speed__read">
        <span style={{ color: ok ? c : '#888' }}>{n ?? '--'}</span>
        <small>KM/H</small>
      </div>
      <div className={`nx-speed__lim${fromRoad ? ' nx-speed__lim--road' : ''}`}>
        <b>{fromRoad ? 'G' : 'LIM'}</b>
        {limit}
      </div>
      {limitLabel && <div className="nx-speed__src">{limitLabel}</div>}
      {over && <div className="nx-speed__warn">تجاوز</div>}
    </div>
  );
}
