import { useMemo, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { LiveMap } from '@/components/map/LiveMap';
import { AlertCard, AlertDetailPanel } from '@/components/alerts/AlertCard';
import { useAlerts, useFleet, useResolveAlert } from '@/hooks/useControlCenter';
import { useControlContext, filterAlerts } from '@/context/ControlContext';
import { guessGovernorate } from '@/lib/constants';
import { useShowFleetOnMap } from '@/context/PreferencesContext';
import type { RoadAlert } from '@/types';
import { Badge } from '@/components/ui/badge';

export default function LiveMapPage() {
  const { projectId, governorateFilter, searchQuery } = useControlContext();
  const { data: alertsRaw = [] } = useAlerts(projectId, { activeOnly: true });
  const { data: fleet = [] } = useFleet(projectId);
  const resolve = useResolveAlert(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const showFleet = useShowFleetOnMap();
  const alerts = filterAlerts(alertsRaw, governorateFilter, searchQuery, guessGovernorate);
  const mapVehicles = showFleet ? fleet : [];
  const selected = useMemo(
    () => (selectedId ? alerts.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, alerts],
  );

  const handleSelect = (alert: RoadAlert | null) => {
    setSelectedId(alert?.id ?? null);
  };

  return (
    <div className="page-shell">
      <TopBar
        title="الخريطة الحية"
        subtitle="تنبيهات نشطة + مركبات متصلة — العراق"
        live
        actions={<Badge className="bg-sky-50 text-sky-700">{alerts.length} على الخريطة</Badge>}
      />

      <div className="grid flex-1 gap-4 p-6 xl:grid-cols-[1fr_360px]">
        <LiveMap alerts={alerts} vehicles={mapVehicles} height="calc(100vh - 200px)" selectedId={selectedId} onSelect={handleSelect} zoom={6} />

        <div className="space-y-3 overflow-auto">
          {selected ? (
            <AlertDetailPanel
              alert={selected}
              onClose={() => setSelectedId(null)}
              onResolve={(id) => { resolve.mutate(id); setSelectedId(null); }}
              resolving={resolve.isPending}
              projectId={projectId}
            />
          ) : (
            <>
              <p className="text-sm font-semibold text-muted-foreground">اختر تنبيهاً من الخريطة</p>
              {alerts.slice(0, 8).map((a) => (
                <AlertCard key={a.id} alert={a} compact onSelect={handleSelect} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
