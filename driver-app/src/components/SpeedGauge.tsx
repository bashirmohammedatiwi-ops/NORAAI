import { useEffect, useState } from 'react';

interface Props {
  speed: number | null;
  limit: number;
}

const SIZE = 168;
const CENTER = SIZE / 2;
const RADIUS = 58;
const STROKE = 9;
const START_ANGLE = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

function speedColor(ratio: number): string {
  if (ratio >= 1) return '#ef4444';
  if (ratio >= 0.9) return '#f97316';
  if (ratio >= 0.75) return '#eab308';
  return '#22c55e';
}

export default function SpeedGauge({ speed, limit }: Props) {
  const [displaySpeed, setDisplaySpeed] = useState<number | null>(null);

  useEffect(() => {
    if (speed == null) return;
    setDisplaySpeed((prev) => {
      if (prev == null) return speed;
      return prev + (speed - prev) * 0.35;
    });
  }, [speed]);

  const hasSpeed = displaySpeed != null;
  const value = hasSpeed ? Math.round(displaySpeed) : null;
  const ratio = hasSpeed && limit > 0 ? displaySpeed / limit : 0;
  const progress = Math.min(ratio, 1.15);
  const arcLength = (SWEEP / 360) * 2 * Math.PI * RADIUS;
  const progressLength = arcLength * Math.min(progress, 1);
  const color = hasSpeed ? speedColor(ratio) : '#64748b';
  const overLimit = hasSpeed && ratio >= 1;
  const warnZone = hasSpeed && ratio >= 0.9 && ratio < 1;
  const bgArc = arcPath(CENTER, CENTER, RADIUS, START_ANGLE, START_ANGLE + SWEEP);

  return (
    <div
      className={`speed-gauge${overLimit ? ' speed-gauge--over' : warnZone ? ' speed-gauge--warn' : ''}`}
      aria-label={hasSpeed ? `السرعة ${value} كيلومتر في الساعة، الحد ${limit}` : 'جاري تحديد السرعة'}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="speed-gauge__svg">
        <defs>
          <linearGradient id="speedGaugeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
          <filter id="speedGaugeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + STROKE}
          fill="rgba(15, 23, 42, 0.72)"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth="1"
        />

        <path
          d={bgArc}
          fill="none"
          stroke="rgba(51, 65, 85, 0.9)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {hasSpeed && (
          <path
            d={bgArc}
            fill="none"
            stroke="url(#speedGaugeGlow)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${arcLength}`}
            className="speed-gauge__arc"
            filter="url(#speedGaugeShadow)"
          />
        )}
      </svg>

      <div className="speed-gauge__center">
        <span
          className="speed-gauge__value"
          style={{ color: hasSpeed ? color : '#94a3b8' }}
        >
          {value ?? '--'}
        </span>
        <span className="speed-gauge__unit">km/h</span>
        <span className="speed-gauge__limit">الحد {limit}</span>
      </div>

      {overLimit && <span className="speed-gauge__badge">تجاوز السرعة</span>}
      {!hasSpeed && <span className="speed-gauge__hint">GPS...</span>}
    </div>
  );
}
