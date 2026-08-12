import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard, EmptyState } from '@/components/shared/StatCard';
import { DemoOnboardingBanner } from '@/components/shared/DemoOnboardingBanner';
import { QueryState } from '@/components/shared/QueryState';
import { LiveMap } from '@/components/map/LiveMap';
import { useFleet } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { governorateName, vehicleGovernorate } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';
import { Camera, MapPin, Wifi, WifiOff, Truck, Signal, List, Map as MapIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEMO_SOURCE_VEHICLE = 'RASID-BGD-02';

export default function FleetPage() {
  const { projectId } = useControlContext();
  const { data: devices = [], isLoading, isError, error, refetch } = useFleet(projectId);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');

  const filtered = useMemo(() => {
    let list = devices;
    if (filter === 'online') list = list.filter((d) => d.is_online);
    if (filter === 'offline') list = list.filter((d) => !d.is_online);
    return [...list].sort((a, b) => {
      if (a.vehicle_id === DEMO_SOURCE_VEHICLE) return -1;
      if (b.vehicle_id === DEMO_SOURCE_VEHICLE) return 1;
      const ga = vehicleGovernorate(a.vehicle_id) ?? '';
      const gb = vehicleGovernorate(b.vehicle_id) ?? '';
      if (ga !== gb) return ga.localeCompare(gb, 'ar');
      return a.vehicle_id.localeCompare(b.vehicle_id);
    });
  }, [devices, filter]);

  const online = devices.filter((d) => d.is_online);
  const mapVehicles = filtered.filter((d) => d.latitude != null && d.longitude != null);
  const sourceVehicle = devices.find((d) => d.vehicle_id === DEMO_SOURCE_VEHICLE);

  return (
    <div className="page-shell animate-fade-in">
      <TopBar
        title="المركبات المتصلة"
        subtitle="أسطول راصد — 10 مركبات بغداد · مصدر العرض: RASID-BGD-02"
        live
      />

      <div className="page-body">
        <DemoOnboardingBanner projectId={projectId} fleetCount={devices.length} mode="fleet" />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Truck} label="إجمالي المركبات" value={devices.length} tone="info" />
          <StatCard icon={Wifi} label="متصل الآن" value={online.length} tone="success" />
          <StatCard icon={Signal} label="غير متصل" value={devices.length - online.length} tone="default" />
        </div>

        {sourceVehicle && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-bold text-primary">مركبة مصدر العرض — {DEMO_SOURCE_VEHICLE}</p>
                <p className="text-xs text-muted-foreground">كل تنبيهات محلة 712 مرتبطة بهذه المركبة</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/alerts?gov=baghdad`}>عرض تنبيهاتها</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'online', 'offline'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition', filter === f ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}>
              {f === 'all' ? 'الكل' : f === 'online' ? 'متصل' : 'غير متصل'}
            </button>
          ))}
          <div className="mr-auto flex gap-1 rounded-lg border p-1">
            <button type="button" onClick={() => setView('grid')} className={cn('rounded-md px-2 py-1', view === 'grid' ? 'bg-primary text-white' : 'text-muted-foreground')}><List className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView('map')} className={cn('rounded-md px-2 py-1', view === 'map' ? 'bg-primary text-white' : 'text-muted-foreground')}><MapIcon className="h-4 w-4" /></button>
          </div>
        </div>

        {view === 'map' && (
          <Card>
            <CardContent className="p-4">
              {mapVehicles.length > 0 ? (
                <LiveMap alerts={[]} vehicles={mapVehicles} height="400px" zoom={13} />
              ) : (
                <EmptyState icon={MapPin} title="لا مواقع GPS" desc="المركبات مسجّلة لكن غير متصلة حالياً — مواقع ثابتة في بيانات العرض" />
              )}
            </CardContent>
          </Card>
        )}

        {isLoading && <p className="text-muted-foreground">جاري التحميل...</p>}
        <QueryState isError={isError} error={error} onRetry={() => refetch()}>
        {!isLoading && devices.length === 0 && (
          <EmptyState icon={Truck} title="لا مركبات مسجّلة" desc="حمّل بيانات العرض من الإعدادات أو استخدم زر التحميل أعلاه" />
        )}

        {view === 'grid' && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => {
              const govId = vehicleGovernorate(d.vehicle_id);
              const isSource = d.vehicle_id === DEMO_SOURCE_VEHICLE;
              return (
              <Card key={d.id} className={cn('transition-all hover:-translate-y-0.5 hover:shadow-md', isSource && 'ring-2 ring-primary/30')}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-bold">{d.driver_name?.trim() || d.vehicle_id}</p>
                      {d.driver_name?.trim() ? (
                        <p className="text-xs text-muted-foreground">🚗 {d.vehicle_id}</p>
                      ) : null}
                      {isSource && <Badge className="mt-1 border-primary/30 bg-primary/10 text-primary">مصدر العرض</Badge>}
                      <p className="text-xs text-muted-foreground">{d.device_id}</p>
                      {govId && <p className="text-xs font-medium text-primary">{governorateName(govId)}</p>}
                    </div>
                    <Badge className={d.is_online ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>
                      {d.is_online ? <><Wifi className="h-3 w-3" /> متصل</> : <><WifiOff className="h-3 w-3" /> غير متصل</>}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />GPS: {d.gps_status}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Camera className="h-3.5 w-3.5" />كاميرا: {d.camera_status}</span>
                  </div>
                  {d.latitude != null && d.longitude != null && (
                    <p className="font-mono text-xs text-muted-foreground">{d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}</p>
                  )}
                  {d.last_communication && (
                    <p className="text-xs text-muted-foreground">آخر اتصال: {formatRelativeTime(d.last_communication)}</p>
                  )}
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
        </QueryState>
      </div>
    </div>
  );
}
