import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/StatCard';
import { useAlerts, useNotifications, useFleet } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { EVENT_META, RECIPIENT_META, governorateName, guessGovernorate } from '@/lib/constants';
import { alertLocationLine } from '@/lib/alertMeta';
import { formatRelativeTime } from '@/lib/utils';
import { Activity, Bell, Radio, Truck } from 'lucide-react';

type FeedItem = {
  id: string;
  at: string;
  title: string;
  subtitle: string;
  tone: string;
  href: string;
  kind: 'alert' | 'notification' | 'fleet';
};

export default function ActivityPage() {
  const { projectId } = useControlContext();
  const { data: alerts = [] } = useAlerts(projectId, { activeOnly: false });
  const { data: notifications = [] } = useNotifications(projectId);
  const { data: fleet = [] } = useFleet(projectId);

  const feed: FeedItem[] = [
    ...alerts.slice(0, 40).map((a) => ({
      id: `alert-${a.id}`,
      at: a.created_at,
      title: a.title ?? EVENT_META[a.event_type]?.labelAr ?? a.event_type,
      subtitle: `${alertLocationLine(a) ?? governorateName(a.municipality_id ?? guessGovernorate(a.latitude, a.longitude))} · ${RECIPIENT_META[a.recipient]?.labelAr ?? a.recipient} · ${a.is_active ? 'نشط' : 'منتهي'}`,
      tone: a.is_active ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/40',
      href: `/alerts?id=${a.id}`,
      kind: 'alert' as const,
    })),
    ...notifications.slice(0, 20).map((n) => ({
      id: `notif-${n.id}`,
      at: n.created_at,
      title: n.message?.slice(0, 60) ?? 'إشعار',
      subtitle: n.read ? 'مقروء' : 'جديد',
      tone: n.read ? 'border-border bg-muted/30' : 'border-amber-200 bg-amber-50/50',
      href: `/alerts?id=${n.id}`,
      kind: 'notification' as const,
    })),
    ...fleet.filter((d) => d.is_online).slice(0, 10).map((d) => ({
      id: `fleet-${d.id}`,
      at: d.last_communication ?? new Date().toISOString(),
      title: `مركبة ${d.vehicle_id}`,
      subtitle: `GPS ${d.gps_status} · كاميرا ${d.camera_status}`,
      tone: 'border-sky-200 bg-sky-50/40',
      href: '/fleet',
      kind: 'fleet' as const,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const kindIcon = { alert: Bell, notification: Radio, fleet: Truck };

  return (
    <div className="page-shell">
      <TopBar title="سجل النشاط" subtitle="خط زمني موحّد — تنبيهات · إشعارات · أسطول" live />

      <div className="page-body max-w-4xl">
        {!feed.length && (
          <EmptyState icon={Activity} title="لا نشاط بعد" desc="ستظهر هنا التنبيهات والإشعارات وتحركات الأسطول" />
        )}

        <div className="relative space-y-3 before:absolute before:right-[19px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
          {feed.map((item) => {
            const Icon = kindIcon[item.kind];
            return (
              <Link key={item.id} to={item.href} className="block">
                <Card className={`transition-all hover:shadow-md ${item.tone}`}>
                  <CardContent className="flex gap-4 p-4">
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{item.title}</p>
                        <Badge className="text-[10px]">{item.kind === 'alert' ? 'تنبيه' : item.kind === 'fleet' ? 'أسطول' : 'إشعار'}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.subtitle}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(item.at)}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
