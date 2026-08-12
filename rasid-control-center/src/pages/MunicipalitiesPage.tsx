import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveMap } from '@/components/map/LiveMap';
import { useAlerts } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { IRAQ_GOVERNORATES, EVENT_META, guessGovernorate, governorateName } from '@/lib/constants';
import { MapPin, Users, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MunicipalitiesPage() {
  const { projectId } = useControlContext();
  const { data: alerts = [] } = useAlerts(projectId, { activeOnly: true });
  const [selected, setSelected] = useState<string | null>(null);

  const stats = useMemo(() => {
    return IRAQ_GOVERNORATES.map((g) => {
      const items = alerts.filter((a) => (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === g.id);
      const byType: Record<string, number> = {};
      for (const a of items) byType[a.event_type] = (byType[a.event_type] ?? 0) + 1;
      return { ...g, total: items.length, byType, items };
    }).sort((a, b) => b.total - a.total);
  }, [alerts]);

  const focus = selected ? stats.find((s) => s.id === selected) : stats.find((s) => s.total > 0) ?? stats[0];

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="محافظات العراق" subtitle="18 محافظة — انقر للتفاصيل والخريطة" />

      <div className="page-body">
        {focus && (
          <Card className="ring-1 ring-primary/15">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {focus.nameAr}
                {selected && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>عرض الكل</Button>
                )}
              </CardTitle>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{focus.total} تنبيه</span>
            </CardHeader>
            <CardContent>
              <LiveMap alerts={focus.items} height="320px" zoom={selected ? 9 : 7} />
              {focus.total > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(focus.byType).map(([type, count]) => (
                    <span key={type} className="chip border bg-card text-xs">
                      {EVENT_META[type as keyof typeof EVENT_META]?.labelAr ?? type}: {count}
                    </span>
                  ))}
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/alerts?gov=${focus.id}`}>عرض في التنبيهات</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stats.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelected(g.id === selected ? null : g.id)}
              className="text-right"
            >
              <Card className={cn(
                'transition hover:ring-2 hover:ring-primary/30',
                g.total > 0 && 'ring-1 ring-primary/20',
                selected === g.id && 'ring-2 ring-primary',
              )}>
                <CardHeader className="flex-row items-start justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{g.nameAr}</CardTitle>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${g.total ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {g.total}
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />{g.population} · {g.capital}
                  </p>
                  {g.total === 0 ? (
                    <p className="text-xs text-muted-foreground">لا تنبيهات نشطة</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(g.byType).slice(0, 3).map(([type, count]) => (
                        <span key={type} className="chip border bg-card text-[10px]">
                          {EVENT_META[type as keyof typeof EVENT_META]?.labelAr ?? type}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                  {selected === g.id && (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary">
                      <ChevronLeft className="h-3 w-3" /> معروضة على الخريطة
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        {selected && (
          <p className="text-center text-xs text-muted-foreground">
            المحافظة المحددة: {governorateName(selected)}
          </p>
        )}
      </div>
    </div>
  );
}
