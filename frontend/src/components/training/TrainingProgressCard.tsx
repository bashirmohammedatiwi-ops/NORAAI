import { METRIC_DISPLAY } from '@/lib/trainingMetrics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  computeEpochEtaSeconds,
  computeEtaSeconds,
  formatDuration,
  phaseIndex,
  TRAINING_PHASES,
  type TrainingProgressDetail,
} from '@/lib/trainingProgress';
import { Cpu, Gauge, Loader2, StopCircle, Timer, Hourglass, Zap } from 'lucide-react';

interface Props {
  progress: number;
  currentEpoch: number;
  totalEpochs: number;
  durationSeconds?: number | null;
  deviceLabel?: string;
  status?: string;
  jobName?: string;
  compact?: boolean;
  phase?: string | null;
  message?: string | null;
  batch?: number | null;
  totalBatches?: number | null;
  detail?: TrainingProgressDetail;
  onStop?: () => void;
  stopping?: boolean;
}

function phaseLabel(phase?: string | null): string {
  if (phase === 'export') return 'تجهيز البيانات';
  if (phase === 'train') return 'تدريب النموذج';
  if (phase === 'validation') return 'تحقق الدورة';
  if (phase === 'finalize') return 'حفظ النموذج';
  return 'جاري التدريب';
}

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value <= 1) return `${(value * 100).toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

export function TrainingProgressCard({
  progress,
  currentEpoch,
  totalEpochs,
  durationSeconds,
  deviceLabel = 'CPU Training',
  status = 'running',
  jobName,
  compact,
  phase,
  message,
  batch,
  totalBatches,
  detail,
  onStop,
  stopping,
}: Props) {
  const pctOverall = Math.min(100, Math.max(0, progress));
  const isActive = status === 'running' || status === 'pending';
  const activePhaseIdx = phaseIndex(phase);
  const eta = detail?.etaSeconds ?? computeEtaSeconds(durationSeconds, pctOverall);
  const exportPct = detail?.exportTotal
    ? Math.round(((detail.exportCurrent ?? 0) / detail.exportTotal) * 100)
    : null;
  const epochPct = detail?.epochProgress ?? (
    batch != null && totalBatches ? Math.round((batch / totalBatches) * 100) : null
  );
  const epochElapsed = detail?.epochElapsedSeconds ?? null;
  const epochEta = detail?.epochEtaSeconds
    ?? computeEpochEtaSeconds(epochElapsed, epochPct);
  const batchesPerMin = detail?.batchesPerMin ?? null;
  const secPerBatch = detail?.secPerBatch ?? null;
  const inTrain = phase === 'train' || phase === 'validation';

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      isActive ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-card' : 'border-border bg-card',
    )}>
      <div className={cn('flex flex-wrap items-center gap-4', compact ? 'p-4' : 'p-5')}>
        <div className="relative shrink-0">
          <svg width={compact ? 72 : 96} height={compact ? 72 : 96} className="-rotate-90">
            <circle cx={compact ? 36 : 48} cy={compact ? 36 : 48} r={compact ? 30 : 40} fill="none" stroke="currentColor" strokeWidth={6} className="text-secondary" />
            <circle
              cx={compact ? 36 : 48}
              cy={compact ? 36 : 48}
              r={compact ? 30 : 40}
              fill="none"
              stroke="currentColor"
              strokeWidth={6}
              strokeLinecap="round"
              className="text-primary transition-all duration-700"
              strokeDasharray={2 * Math.PI * (compact ? 30 : 40)}
              strokeDashoffset={2 * Math.PI * (compact ? 30 : 40) * (1 - pctOverall / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isActive ? <Loader2 className="h-4 w-4 animate-spin text-primary mb-0.5" /> : null}
            <span className={cn('font-bold', compact ? 'text-lg' : 'text-2xl')}>{pctOverall}%</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">إجمالي</span>
          </div>
        </div>

        <div className="flex-1 min-w-[200px] space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{isActive ? phaseLabel(phase) : 'حالة التدريب'}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              <Cpu className="h-3 w-3" /> {deviceLabel}
            </span>
          </div>
          {jobName && <p className="text-xs text-muted-foreground">{jobName}</p>}
          {message && <p className="text-sm text-foreground/80 font-medium">{message}</p>}

          {phase === 'export' && detail?.exportTotal != null && (
            <SimpleCounters
              items={[
                { label: 'الصور', value: `${detail.exportCurrent ?? 0} / ${detail.exportTotal}`, sub: exportPct != null ? `${exportPct}%` : undefined },
                { label: 'الوقت', value: durationSeconds ? formatDuration(durationSeconds) : '—', icon: <Timer className="h-3.5 w-3.5" /> },
              ]}
            />
          )}

          {inTrain && totalEpochs > 0 && (
            <SimpleCounters
              items={[
                ...(detail?.trainImages != null ? [{
                  label: 'صور التدريب',
                  value: `${detail.trainImages}${detail.valImages != null ? ` + ${detail.valImages} val` : ''}`,
                  sub: detail.exportedImages != null ? `${detail.exportedImages} مُصدَّرة` : undefined,
                }] : []),
                {
                  label: 'الدورة',
                  value: `${currentEpoch} / ${totalEpochs}`,
                  sub: epochPct != null ? `${epochPct}%` : undefined,
                },
                {
                  label: 'داخل الدورة',
                  value: batch != null && totalBatches ? `${batch} / ${totalBatches}` : '—',
                  sub: 'batch',
                },
                {
                  label: 'زمن الدورة',
                  value: epochElapsed != null ? formatDuration(epochElapsed) : '—',
                  icon: <Timer className="h-3.5 w-3.5" />,
                },
                {
                  label: 'متبقي للدورة',
                  value: epochEta != null ? `~${formatDuration(epochEta)}` : '—',
                  icon: <Hourglass className="h-3.5 w-3.5" />,
                },
                {
                  label: 'السرعة',
                  value: batchesPerMin != null ? `${batchesPerMin}` : '—',
                  sub: secPerBatch != null ? `${secPerBatch}s / batch` : 'batch/min',
                  icon: <Zap className="h-3.5 w-3.5" />,
                },
                {
                  label: 'متبقي كلي',
                  value: eta != null ? `~${formatDuration(eta)}` : '—',
                  icon: <Gauge className="h-3.5 w-3.5" />,
                },
              ]}
            />
          )}

          {!inTrain && phase !== 'export' && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {durationSeconds != null && durationSeconds > 0 && (
                <Stat label="الوقت المنقضي" value={formatDuration(durationSeconds)} icon={<Timer className="h-3 w-3" />} />
              )}
              {eta != null && isActive && (
                <Stat label="المتبقي" value={formatDuration(eta)} icon={<Hourglass className="h-3 w-3" />} />
              )}
            </div>
          )}

          <div className="space-y-2">
            <ProgressRow label="التقدم الكلي" value={pctOverall} />
            {inTrain && epochPct != null && (
              <ProgressRow label={`الدورة ${currentEpoch}`} value={epochPct} subtle />
            )}
          </div>

          {(detail?.loss != null || detail?.map50_95 != null) && (
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
              {detail.loss != null && (
                <span>Loss: <strong className="font-mono text-foreground">{detail.loss.toFixed(4)}</strong></span>
              )}
              {detail.map50_95 != null && (
                <span>{METRIC_DISPLAY.accuracy.label}: <strong className="text-foreground">{pct(detail.map50_95)}</strong></span>
              )}
            </div>
          )}
        </div>

        {isActive && onStop && (
          <Button type="button" variant="destructive" size={compact ? 'sm' : 'default'} className="shrink-0" disabled={stopping} onClick={onStop}>
            {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
            {stopping ? 'إيقاف…' : 'إيقاف'}
          </Button>
        )}
      </div>

      {isActive && !compact && (
        <div className="px-5 pb-4 border-t border-border/60 bg-secondary/20">
          <div className="grid grid-cols-3 gap-2 pt-3">
            {TRAINING_PHASES.map((step, idx) => {
              const done = activePhaseIdx > idx;
              const active = activePhaseIdx === idx;
              return (
                <div
                  key={step.id}
                  className={cn(
                    'rounded-lg px-2 py-2 text-center text-xs border transition-colors',
                    done && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                    active && 'border-primary/40 bg-primary/10 text-primary font-medium',
                    !done && !active && 'border-border/50 text-muted-foreground',
                  )}
                >
                  <p className="font-medium truncate">{step.label}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">{step.range[0]}–{step.range[1]}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleCounters({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string; icon?: React.ReactNode }>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border/70 bg-card/80 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            {item.icon}
            {item.label}
          </p>
          <p className="text-base font-bold leading-tight mt-1">{item.value}</p>
          {item.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  subtle,
}: {
  label: string;
  value: number;
  subtle?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value}%</span>
      </div>
      <div className={cn('h-2 rounded-full overflow-hidden', subtle ? 'bg-secondary/80' : 'bg-secondary')}>
        <div
          className={cn('h-full transition-all duration-500 rounded-full', subtle ? 'bg-primary/60' : 'bg-primary')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  mono,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className={cn('font-semibold leading-none mt-0.5', mono && 'font-mono')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
