import type { WorkspaceStats } from '@/hooks/useAnnotationWorkspace';
import { cn } from '@/lib/utils';
import { CheckCircle2, ImageIcon, PenLine, Timer } from 'lucide-react';

interface Props {
  stats: WorkspaceStats | null;
  loading?: boolean;
}

const items = [
  { key: 'total_images' as const, label: 'صور', labelEn: 'Images', icon: ImageIcon },
  { key: 'annotated_images' as const, label: 'بصناديق', labelEn: 'With boxes', icon: CheckCircle2 },
  { key: 'healthy_images' as const, label: 'سليمة', labelEn: 'Healthy', icon: PenLine },
  { key: 'pending_review' as const, label: 'بانتظار المراجعة', labelEn: 'Pending', icon: Timer },
];

export function AnnotationStatsBar({ stats, loading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ key, label, labelEn, icon: Icon }) => (
        <div
          key={key}
          className={cn(
            'rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3',
            key === 'healthy_images' && (stats?.healthy_images ?? 0) > 0 && 'border-sky-500/30 bg-sky-500/5',
            key === 'pending_review' && (stats?.pending_review ?? 0) > 0 && 'border-amber-500/40 bg-amber-500/5',
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums leading-none">
              {loading ? '—' : (stats?.[key] ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {label} · {labelEn}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
