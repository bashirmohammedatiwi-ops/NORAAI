import { Bell, ChevronLeft } from 'lucide-react';
import { eventMeta } from '@/lib/constants';
import { alertPopupLines } from '@/lib/alertMeta';
import { formatRelativeTime } from '@/lib/utils';
import type { RoadAlert } from '@/types';

interface CommandTickerProps {
  alerts: RoadAlert[];
  onSelect?: (alert: RoadAlert) => void;
}

export function CommandTicker({ alerts, onSelect }: CommandTickerProps) {
  if (!alerts.length) return null;

  const items = alerts.slice(0, 14);
  const doubled = [...items, ...items];

  return (
    <div className="relative z-20 mx-4 mb-3 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
        <Bell className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold text-foreground">آخر التنبيهات</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{items.length}</span>
      </div>
      <div className="overflow-hidden py-2.5">
        <div className="command-ticker flex w-max gap-8 whitespace-nowrap px-4 text-xs text-foreground">
          {doubled.map((a, i) => {
            const meta = eventMeta(a.event_type);
            const popup = alertPopupLines(a);
            return (
              <button
                key={`${a.id}-${i}`}
                type="button"
                onClick={() => onSelect?.(a)}
                className="group inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-accent"
              >
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  {meta.labelAr}
                </span>
                <span className="max-w-[180px] truncate font-medium">{popup.title}</span>
                {popup.subtitle && (
                  <span className="max-w-[140px] truncate text-[10px] text-muted-foreground">{popup.subtitle}</span>
                )}
                <span className="text-muted-foreground">{formatRelativeTime(a.created_at)}</span>
                <ChevronLeft className="h-3 w-3 opacity-0 transition group-hover:opacity-50" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
