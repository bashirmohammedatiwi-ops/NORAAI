import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { AlertCard, AlertDetailPanel } from '@/components/alerts/AlertCard';
import { EmptyState } from '@/components/shared/StatCard';
import { QueryState } from '@/components/shared/QueryState';
import { useAlerts, useResolveAlert } from '@/hooks/useControlCenter';
import { useControlContext, filterAlerts } from '@/context/ControlContext';
import { RECIPIENT_TABS, RECIPIENT_META, guessGovernorate } from '@/lib/constants';
import type { AlertRecipient, RoadAlert } from '@/types';
import { cn } from '@/lib/utils';
import { Bell } from 'lucide-react';

export default function AlertsPage() {
  const { projectId, governorateFilter, setGovernorateFilter, searchQuery } = useControlContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkId = searchParams.get('id');
  const [tab, setTab] = useState<AlertRecipient | 'all'>('all');
  const [selected, setSelected] = useState<RoadAlert | null>(null);
  const recipient = tab === 'all' ? undefined : tab;

  const { data: activeList = [], isLoading, isError, error, refetch } = useAlerts(projectId, {
    activeOnly: true,
    recipient,
  });
  const { data: allForLink = [] } = useAlerts(projectId, {
    activeOnly: false,
    recipient,
  });

  const raw = useMemo(() => {
    if (!linkId) return activeList;
    const resolved = allForLink.find((a) => a.id === linkId);
    if (resolved && !activeList.some((a) => a.id === linkId)) {
      return [resolved, ...activeList];
    }
    return activeList;
  }, [activeList, allForLink, linkId]);

  const resolve = useResolveAlert(projectId);

  useEffect(() => {
    const gov = searchParams.get('gov');
    if (gov) setGovernorateFilter(gov);
  }, [searchParams, setGovernorateFilter]);

  useEffect(() => {
    if (!linkId) return;
    const match = allForLink.find((a) => a.id === linkId) ?? raw.find((a) => a.id === linkId);
    if (match) setSelected(match);
  }, [linkId, allForLink, raw]);

  const alerts = useMemo(
    () => filterAlerts(raw, governorateFilter, searchQuery, guessGovernorate),
    [raw, governorateFilter, searchQuery],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activeList) m.set(a.recipient, (m.get(a.recipient) ?? 0) + 1);
    return m;
  }, [activeList]);

  function handleSelect(alert: RoadAlert) {
    setSelected(alert);
    const next = new URLSearchParams(searchParams);
    next.set('id', alert.id);
    setSearchParams(next, { replace: true });
  }

  function handleCloseDetail() {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page-shell">
      <TopBar title="مركز التنبيهات" subtitle="مصنّفة حسب الجهة — إنهاء التنبيه يزيله من الخريطة الحية" live />

      <div className="border-b border-border bg-white px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {RECIPIENT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-semibold transition-all',
                tab === t.id
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-border bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {t.label}
              {t.id !== 'all' && counts.get(t.id) ? ` (${counts.get(t.id)})` : ''}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(RECIPIENT_META).map(([k, v]) => (
            <span key={k} className="chip border bg-white text-[11px]" style={{ borderColor: `${v.color}44`, color: v.color }}>
              {v.labelAr}: {v.desc}
            </span>
          ))}
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <QueryState isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()}>
            {!alerts.length && (
              <EmptyState icon={Bell} title="لا توجد تنبيهات" desc="لا توجد تنبيهات نشطة في هذا القسم أو المحافظة المحددة" />
            )}
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                selected={selected?.id === a.id}
                onSelect={handleSelect}
                onResolve={(id) => { resolve.mutate(id); if (selected?.id === id) handleCloseDetail(); }}
                resolving={resolve.isPending}
              />
            ))}
          </QueryState>
        </div>

        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-auto border-t border-border bg-background shadow-2xl lg:static lg:max-h-none lg:border-0 lg:shadow-none">
            <AlertDetailPanel
              alert={selected}
              onClose={handleCloseDetail}
              onResolve={(id) => { resolve.mutate(id); handleCloseDetail(); }}
              resolving={resolve.isPending}
              projectId={projectId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
