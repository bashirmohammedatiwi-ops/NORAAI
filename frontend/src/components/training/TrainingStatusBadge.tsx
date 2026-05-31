import { cn } from '@/lib/utils';
import { Brain, CheckCircle2, Clock, Loader2, XCircle, Ban } from 'lucide-react';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Failed' },
  cancelled: { icon: Ban, color: 'text-gray-400', bg: 'bg-gray-400/10', label: 'Cancelled' },
};

interface Props {
  status: string;
  progress?: number;
  showProgress?: boolean;
}

export function TrainingStatusBadge({ status, progress = 0, showProgress = false }: Props) {
  const cfg = statusConfig[status] || statusConfig.pending;
  const Icon = cfg.icon;

  return (
    <div className="space-y-1">
      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
        <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
        {cfg.label}
        {status === 'running' && showProgress && ` ${progress}%`}
      </span>
      {showProgress && status === 'running' && (
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

export function ArchitectureBadge({ architecture }: { architecture: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded">
      <Brain className="h-3 w-3" />
      {architecture.toUpperCase().replace('_', ' ')}
    </span>
  );
}
