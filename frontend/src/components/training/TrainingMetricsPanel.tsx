import { cn } from '@/lib/utils';
import { Target, Crosshair, Scan, Gauge, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { normalizeQualityMetrics, METRIC_DISPLAY, type TrainingMetricsMeta } from '@/lib/trainingMetrics';

export interface QualityMetrics {
  loss?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1?: number | null;
  map50?: number | null;
  map50_95?: number | null;
}

interface Props {
  metrics: QualityMetrics | null;
  metricsMeta?: TrainingMetricsMeta | null;
  title?: string;
  subtitle?: string;
  trainingProgress?: number;
  epoch?: { current: number; total: number };
  status?: string;
  compact?: boolean;
}

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function Ring({ value, color, size = 72 }: { value: number | null | undefined; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pctVal = value != null && !Number.isNaN(value) ? Math.min(100, Math.max(0, value * 100)) : 0;
  const offset = circ - (pctVal / 100) * circ;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={5} className="text-secondary" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="transition-all duration-700"
      />
    </svg>
  );
}

const METRIC_DEFS = [
  { key: 'map50_95' as const, label: METRIC_DISPLAY.accuracy.label, sub: METRIC_DISPLAY.accuracy.sub, icon: Target, color: '#2563eb', ring: '#2563eb' },
  { key: 'map50' as const, label: METRIC_DISPLAY.detectionAccuracy.label, sub: METRIC_DISPLAY.detectionAccuracy.sub, icon: Crosshair, color: '#7c3aed', ring: '#7c3aed' },
  { key: 'precision' as const, label: 'Precision', sub: 'True positives', icon: Scan, color: '#059669', ring: '#059669' },
  { key: 'recall' as const, label: 'Recall', sub: 'Coverage', icon: Gauge, color: '#d97706', ring: '#d97706' },
  { key: 'f1' as const, label: 'F1 Score', sub: 'Balanced', icon: Activity, color: '#0891b2', ring: '#0891b2' },
];

export function TrainingMetricsPanel({
  metrics,
  metricsMeta,
  title = 'Model Quality',
  subtitle,
  trainingProgress,
  epoch,
  status,
  compact,
}: Props) {
  const normalized = normalizeQualityMetrics(metrics);
  const hasMetrics = normalized && METRIC_DEFS.some(({ key }) => normalized[key] != null);
  const warning = metricsMeta?.high_score_warning
    ?? (metricsMeta?.simulated
      ? 'المقاييس محاكاة لأن التدريب الحقيقي على GPU غير متاح.'
      : null);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {status === 'running' && trainingProgress != null && (
            <div className="text-right min-w-[120px]">
              <p className="text-xs text-muted-foreground mb-1">
                Training {trainingProgress}%
                {epoch && ` · Epoch ${epoch.current}/${epoch.total}`}
              </p>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${trainingProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {warning && (
        <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}

      {!hasMetrics ? (
        <div className="px-5 py-10 text-center text-muted-foreground text-sm">
          —
        </div>
      ) : (
        <div className={cn('p-5', compact ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : 'grid grid-cols-2 lg:grid-cols-5 gap-4')}>
          {METRIC_DEFS.map(({ key, label, sub, icon: Icon, color, ring }) => {
            const val = normalized?.[key];
            return (
              <div
                key={key}
                className="relative flex flex-col items-center rounded-xl border border-border/60 bg-secondary/30 p-4 text-center hover:border-primary/20 transition-colors"
              >
                <div className="relative mb-2">
                  <Ring value={val} color={ring} size={compact ? 64 : 72} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold rotate-90" style={{ color }}>
                    {pct(val)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                  {label}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {normalized?.loss != null && (
        <div className="px-5 pb-4 flex items-center gap-2 text-sm border-t border-border pt-3 mx-5 mb-0">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <span className="text-muted-foreground">Loss</span>
          <span className="font-mono font-semibold ml-auto">{normalized.loss.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
