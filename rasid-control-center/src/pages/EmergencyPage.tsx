import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard, EmptyState } from '@/components/shared/StatCard';
import { LiveMap } from '@/components/map/LiveMap';
import { useAlerts, useFleet, useResolveAlert } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { RECIPIENT_META } from '@/lib/constants';
import { Siren, Phone, Ambulance, Shield, Building2 } from 'lucide-react';
import { AlertCard } from '@/components/alerts/AlertCard';
import { Button } from '@/components/ui/button';

const EMERGENCY_LINES = [
  { label: 'الطوارئ الموحّدة', tel: '911', note: 'شرطة · إسعاف · حريق' },
  { label: 'الإسعاف', tel: '122', note: 'حالات طبية' },
  { label: 'الدفاع المدني', tel: '115', note: 'حريق · إنقاذ' },
];

export default function EmergencyPage() {
  const { projectId } = useControlContext();
  const { data: ambulanceAlerts = [] } = useAlerts(projectId, { activeOnly: true, recipient: 'ambulance' });
  const { data: allActive = [] } = useAlerts(projectId, { activeOnly: true });
  const accidents = allActive.filter((a) => a.event_type === 'accident');
  const municipality = allActive.filter((a) => a.recipient === 'municipality');
  const { data: fleet = [] } = useFleet(projectId);
  const resolve = useResolveAlert(projectId);

  const critical = accidents.length > 0 ? accidents : ambulanceAlerts;
  const unique = Array.from(new Map(critical.map((a) => [a.id, a])).values());

  return (
    <div className="page-shell">
      <TopBar title="غرفة الطوارئ" subtitle="استجابة فورية — إسعاف · شرطة · حوادث · بلدية" live />

      <div className="page-body">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard icon={Siren} label="حالات حرجة" value={unique.length} tone="danger" />
          <StatCard icon={Ambulance} label="إسعاف" value={ambulanceAlerts.length} tone="warning" />
          <StatCard icon={Building2} label="بلدية (712)" value={municipality.length} tone="info" />
          <StatCard icon={Shield} label="مركبات متصلة" value={fleet.filter((f) => f.is_online).length} tone="success" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <LiveMap alerts={unique.length ? unique : municipality.slice(0, 20)} height="320px" zoom={unique.length ? 6 : 13} />
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="font-bold">بروتوكول الاستجابة</h2>
            {[
              { step: 1, title: 'كشف AI فوري', desc: 'YOLO على حافة الشبكة — مركبة RASID-BGD-02' },
              { step: 2, title: 'تصنيف الجهة', desc: RECIPIENT_META.ambulance.desc },
              { step: 3, title: 'إشعار + خريطة', desc: 'WebSocket · تحديث مباشر للوحة التحكم' },
              { step: 4, title: 'إنهاء الحالة', desc: 'إزالة من الخريطة الحية بعد المعالجة' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3 rounded-xl border border-border bg-white p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">{step}</span>
                <div><p className="font-semibold">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-3">
              {EMERGENCY_LINES.map((line) => (
                <a
                  key={line.tel}
                  href={`tel:${line.tel}`}
                  className="flex flex-col items-center gap-1 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-700 hover:bg-red-100"
                >
                  <Phone className="h-4 w-4" />
                  {line.label}
                  <span className="font-mono text-lg">{line.tel}</span>
                  <span className="text-[10px] font-normal text-red-600">{line.note}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">حالات طوارئ نشطة ({unique.length})</h2>
          {municipality.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/alerts?gov=baghdad">تنبيهات البلدية — محلة 712</Link>
            </Button>
          )}
        </div>
        {unique.length === 0 ? (
          <EmptyState
            icon={Siren}
            title="لا حوادث حرجة"
            desc={`الوضع مستقر — ${municipality.length} تنبيه بلدية نشط في الزيونة`}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {unique.map((a) => (
              <AlertCard key={a.id} alert={a} onResolve={(id) => resolve.mutate(id)} resolving={resolve.isPending} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
