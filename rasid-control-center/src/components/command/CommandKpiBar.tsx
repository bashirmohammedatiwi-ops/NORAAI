import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KpiItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'default' | 'danger' | 'success' | 'warning' | 'info';
}

interface CommandKpiBarProps {
  items: KpiItem[];
}

const toneIcon: Record<NonNullable<KpiItem['tone']>, string> = {
  default: 'bg-slate-100 text-slate-600',
  danger: 'bg-red-50 text-red-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-sky-50 text-sky-600',
};

const toneValue: Record<NonNullable<KpiItem['tone']>, string> = {
  default: 'text-foreground',
  danger: 'text-red-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
};

export function CommandKpiBar({ items }: CommandKpiBarProps) {
  return (
    <div className="relative z-20 shrink-0 border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(({ label, value, icon: Icon, tone = 'default' }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm transition hover:shadow-md"
          >
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneIcon[tone])}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
              <p className={cn('text-xl font-bold tabular-nums leading-tight', toneValue[tone])}>{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
