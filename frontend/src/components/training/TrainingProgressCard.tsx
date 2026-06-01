import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  computeEtaSeconds,
  formatDuration,
  phaseIndex,
  TRAINING_PHASES,
  type TrainingProgressDetail,
} from '@/lib/trainingProgress';
import { Cpu, Loader2, StopCircle, Timer, Hourglass } from 'lucide-react';

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
  if (phase === 'export') return 'Preparing dataset';
  if (phase === 'train') return 'Training model';
  if (phase === 'finalize') return 'Saving model';
  return 'Training in progress';
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

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      isActive ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-card' : 'border-border bg-card',
    )}>
      <div className={cn('flex flex-wrap items-center gap-4', compact ? 'p-4' : 'p-5')}>
        <div className="relative shrink-0">
          <svg width={compact ? 72 : 88} height={compact ? 72 : 88} className="-rotate-90">
            <circle cx={compact ? 36 : 44} cy={compact ? 36 : 44} r={compact ? 30 : 38} fill="none" stroke="currentColor" strokeWidth={6} className="text-secondary" />
            <circle
              cx={compact ? 36 : 44}
              cy={compact ? 36 : 44}
              r={compact ? 30 : 38}
              fill="none"
              stroke="currentColor"
              strokeWidth={6}
              strokeLinecap="round"
              className="text-primary transition-all duration-700"
              strokeDasharray={2 * Math.PI * (compact ? 30 : 38)}
              strokeDashoffset={2 * Math.PI * (compact ? 30 : 38) * (1 - pctOverall / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isActive ? <Loader2 className="h-4 w-4 animate-spin text-primary mb-0.5" /> : null}
            <span className={cn('font-bold', compact ? 'text-lg' : 'text-xl')}>{pctOverall}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-[180px] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{isActive ? phaseLabel(phase) : 'Training status'}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              <Cpu className="h-3 w-3" /> {deviceLabel}
            </span>
          </div>
          {jobName && <p className="text-xs text-muted-foreground">{jobName}</p>}
          {message && <p className="text-sm text-foreground/80 font-medium">{message}</p>}

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {phase === 'export' && detail?.exportTotal != null && (
              <Stat label="Images" value={`${detail.exportCurrent ?? 0} / ${detail.exportTotal}`} sub={exportPct != null ? `${exportPct}%` : undefined} />
            )}
            {phase !== 'export' && totalEpochs > 0 && (
              <Stat label="Epoch" value={`${currentEpoch} / ${totalEpochs}`} sub={epochPct != null ? `${epochPct}% in epoch` : undefined} />
            )}
            {batch != null && totalBatches != null && totalBatches > 0 && phase === 'train' && (
              <Stat label="Batch" value={`${batch} / ${totalBatches}`} />
            )}
            {detail?.currentStep != null && detail?.totalSteps != null && phase === 'train' && (
              <Stat label="Global step" value={`${detail.currentStep} / ${detail.totalSteps}`} />
            )}
            {durationSeconds != null && durationSeconds > 0 && (
              <Stat label="Elapsed" value={formatDuration(durationSeconds)} icon={<Timer className="h-3 w-3" />} />
            )}
            {eta != null && isActive && (
              <Stat label="ETA" value={formatDuration(eta)} icon={<Hourglass className="h-3 w-3" />} />
            )}
            {detail?.loss != null && (
              <Stat label="Loss" value={detail.loss.toFixed(4)} mono />
            )}
            {detail?.map50 != null && (
              <Stat label="mAP50" value={pct(detail.map50)} />
            )}
          </div>

          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700 rounded-full" style={{ width: `${pctOverall}%` }} />
            </div>
            {phase === 'train' && epochPct != null && (
              <div className="h-1 rounded-full bg-secondary/80 overflow-hidden">
                <div className="h-full bg-primary/60 transition-all duration-500 rounded-full" style={{ width: `${epochPct}%` }} />
              </div>
            )}
          </div>
        </div>

        {isActive && onStop && (
          <Button type="button" variant="destructive" size={compact ? 'sm' : 'default'} className="shrink-0" disabled={stopping} onClick={onStop}>
            {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
            {stopping ? 'Stopping…' : 'Stop Training'}
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
          {(detail?.lossBox != null || detail?.lossCls != null) && (
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
              {detail.lossBox != null && <span>Box loss: <strong className="font-mono text-foreground">{detail.lossBox.toFixed(4)}</strong></span>}
              {detail.lossCls != null && <span>Cls loss: <strong className="font-mono text-foreground">{detail.lossCls.toFixed(4)}</strong></span>}
              {detail.precision != null && <span>Precision: <strong className="text-foreground">{pct(detail.precision)}</strong></span>}
            </div>
          )}
        </div>
      )}
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
