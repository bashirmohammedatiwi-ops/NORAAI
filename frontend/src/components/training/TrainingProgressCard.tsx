import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cpu, Loader2, StopCircle, Timer } from 'lucide-react';

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
  onStop?: () => void;
  stopping?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function phaseLabel(phase?: string | null): string {
  if (phase === 'export') return 'Preparing dataset';
  if (phase === 'train') return 'Training model';
  return 'Training in progress';
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
  onStop,
  stopping,
}: Props) {
  const pct = Math.min(100, Math.max(0, progress));
  const isActive = status === 'running' || status === 'pending';
  const showEpoch = phase !== 'export';

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      isActive ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-card' : 'border-border bg-card',
    )}>
      <div className={cn('flex flex-wrap items-center gap-4', compact ? 'p-4' : 'p-5')}>
        <div className="relative shrink-0">
          <svg width={compact ? 72 : 88} height={compact ? 72 : 88} className="-rotate-90">
            <circle
              cx={compact ? 36 : 44}
              cy={compact ? 36 : 44}
              r={compact ? 30 : 38}
              fill="none"
              stroke="currentColor"
              strokeWidth={6}
              className="text-secondary"
            />
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
              strokeDashoffset={2 * Math.PI * (compact ? 30 : 38) * (1 - pct / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isActive ? <Loader2 className="h-4 w-4 animate-spin text-primary mb-0.5" /> : null}
            <span className={cn('font-bold', compact ? 'text-lg' : 'text-xl')}>{pct}%</span>
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
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            {showEpoch && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Epoch</p>
                <p className="font-mono font-semibold text-lg leading-none">
                  {currentEpoch}<span className="text-muted-foreground text-sm"> / {totalEpochs || '—'}</span>
                </p>
              </div>
            )}
            {batch != null && totalBatches != null && totalBatches > 0 && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Batch</p>
                <p className="font-mono font-semibold text-lg leading-none">
                  {batch}<span className="text-muted-foreground text-sm"> / {totalBatches}</span>
                </p>
              </div>
            )}
            {durationSeconds != null && durationSeconds > 0 && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" /> Elapsed
                </p>
                <p className="font-mono font-semibold">{formatDuration(durationSeconds)}</p>
              </div>
            )}
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {isActive && onStop && (
          <Button
            type="button"
            variant="destructive"
            size={compact ? 'sm' : 'default'}
            className="shrink-0"
            disabled={stopping}
            onClick={onStop}
          >
            {stopping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <StopCircle className="h-4 w-4" />
            )}
            {stopping ? 'Stopping…' : 'Stop Training'}
          </Button>
        )}
      </div>
    </div>
  );
}
