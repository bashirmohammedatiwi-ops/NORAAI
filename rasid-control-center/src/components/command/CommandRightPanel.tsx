import { useEffect, useMemo, useRef } from 'react';
import { AlertDetailPanel } from '@/components/alerts/AlertCard';
import { AlertCard } from '@/components/alerts/AlertCard';
import { List, Truck, CheckCircle2 } from 'lucide-react';
import type { RoadAlert, FleetDevice } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface CommandRightPanelProps {
  alerts: RoadAlert[];
  selected: RoadAlert | null;
  onSelect: (alert: RoadAlert | null) => void;
  onResolve: (id: string) => void;
  resolving: boolean;
  fleet: FleetDevice[];
  avgAgeMinutes: number | null;
  projectId: string;
}

export function CommandRightPanel({
  alerts,
  selected,
  onSelect,
  onResolve,
  resolving,
  fleet,
  avgAgeMinutes,
  projectId,
}: CommandRightPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const onlineFleet = useMemo(
    () => fleet.filter((f) => f.is_online).slice(0, 8),
    [fleet],
  );

  useEffect(() => {
    if (!selected || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-alert-id="${selected.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected?.id]);

  if (selected) {
    return (
      <aside className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <AlertDetailPanel
          alert={selected}
          onClose={() => onSelect(null)}
          onResolve={onResolve}
          resolving={resolving}
          projectId={projectId}
        />
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <List className="h-4 w-4 text-primary" />
          قائمة التنبيهات
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{alerts.length}</span>
        </span>
        {avgAgeMinutes != null && (
          <span className="text-[11px] text-muted-foreground">متوسط العمر: {avgAgeMinutes} د</span>
        )}
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">لا تنبيهات مطابقة</p>
            <p className="mt-1 text-xs text-muted-foreground">عدّل الفلاتر أو انتظر بثاً جديداً</p>
          </div>
        ) : (
          alerts.map((a) => (
            <div key={a.id} data-alert-id={a.id}>
              <AlertCard
                alert={a}
                compact
                selected={false}
                onSelect={onSelect}
                onResolve={onResolve}
                resolving={resolving}
              />
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-muted/20 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Truck className="h-3.5 w-3.5 text-primary" />
          أسطول متصل ({onlineFleet.length})
        </p>
        <div className="space-y-1">
          {onlineFleet.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا مركبات متصلة حالياً</p>
          ) : (
            onlineFleet.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-2 text-xs">
                <div className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {v.driver_name?.trim() || v.vehicle_id}
                  </span>
                  {v.driver_name?.trim() ? (
                    <span className="text-[10px] text-muted-foreground">{v.vehicle_id}</span>
                  ) : null}
                  {v.phone_number?.trim() ? (
                    <span className="block truncate text-[10px] text-muted-foreground">{v.phone_number.trim()}</span>
                  ) : null}
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {v.last_communication ? formatRelativeTime(v.last_communication) : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
