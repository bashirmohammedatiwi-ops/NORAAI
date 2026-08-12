import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOverview, useAlerts, useFleet } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { useToast } from '@/context/ToastContext';
import { EVENT_META, IRAQ_GOVERNORATES, governorateName, guessGovernorate } from '@/lib/constants';
import { alertBlock, alertReference, alertStreet } from '@/lib/alertMeta';
import { alertsLast24h, downloadFile, toCsv } from '@/lib/analytics';
import { FileText, Download, Calendar, MapPin, Truck, Brain } from 'lucide-react';

export default function ReportsPage() {
  const { projectId } = useControlContext();
  const { data: overview } = useOverview(projectId);
  const { data: alerts = [] } = useAlerts(projectId, { activeOnly: false });
  const { data: fleet = [] } = useFleet(projectId);
  const { toast } = useToast();

  const last24 = alertsLast24h(alerts);

  function exportFullJson() {
    const data = {
      generated: new Date().toISOString(),
      region: 'Iraq',
      overview,
      alerts: alerts.slice(0, 500),
      fleet,
      last24h_count: last24.length,
      governorates: IRAQ_GOVERNORATES.map((g) => ({
        id: g.id,
        nameAr: g.nameAr,
        alerts: alerts.filter((a) => (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === g.id).length,
      })),
    };
    downloadFile(JSON.stringify(data, null, 2), `rasid-full-${Date.now()}.json`, 'application/json');
    toast({ title: 'تم تصدير JSON الكامل', tone: 'success' });
  }

  function exportDailyCsv() {
    const rows = last24.map((a) => ({
      id: a.id,
      title: a.title ?? '',
      reference: alertReference(a) ?? '',
      type: a.event_type,
      recipient: a.recipient,
      governorate: governorateName(a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)),
      block: alertBlock(a) ?? '',
      street: alertStreet(a) ?? '',
      active: a.is_active,
      confidence: a.confidence ?? '',
      created_at: a.created_at,
    }));
    downloadFile(
      toCsv(rows, ['id', 'title', 'reference', 'type', 'recipient', 'governorate', 'block', 'street', 'active', 'confidence', 'created_at']),
      `rasid-daily-${Date.now()}.csv`,
      'text/csv',
    );
    toast({ title: 'تم تصدير CSV اليومي', tone: 'success' });
  }

  function exportGovJson() {
    const gov = IRAQ_GOVERNORATES.map((g) => ({
      ...g,
      alerts: alerts.filter((a) => (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === g.id).length,
      active: alerts.filter((a) => a.is_active && (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === g.id).length,
    }));
    downloadFile(JSON.stringify({ generated: new Date().toISOString(), governorates: gov }, null, 2), `rasid-gov-${Date.now()}.json`, 'application/json');
    toast({ title: 'تم تصدير تقرير المحافظات', tone: 'success' });
  }

  function exportFleetJson() {
    downloadFile(JSON.stringify({ generated: new Date().toISOString(), fleet, online: fleet.filter((d) => d.is_online).length }, null, 2), `rasid-fleet-${Date.now()}.json`, 'application/json');
    toast({ title: 'تم تصدير تقرير الأسطول', tone: 'success' });
  }

  const templates = [
    { id: 'daily', title: 'تقرير يومي CSV', desc: `${last24.length} حدث خلال 24 س`, icon: Calendar, action: exportDailyCsv },
    { id: 'gov', title: 'تقرير محافظات', desc: 'توزيع جغرافي JSON', icon: MapPin, action: exportGovJson },
    { id: 'fleet', title: 'تقرير الأسطول', desc: `${fleet.length} مركبة`, icon: Truck, action: exportFleetJson },
    { id: 'full', title: 'تصدير شامل', desc: 'JSON كامل للنظام', icon: Brain, action: exportFullJson },
  ];

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="التقارير" subtitle="تصدير تشغيلي — JSON · CSV" actions={
        <Button size="sm" onClick={exportFullJson}><Download className="h-4 w-4" /> JSON شامل</Button>
      } />

      <div className="page-body">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map(({ id, title, desc, icon: Icon, action }) => (
            <Card key={id} className="group transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">
                <Icon className="mb-3 h-8 w-8 text-primary transition group-hover:scale-110" />
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={action}>إنشاء</Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />ملخص سريع</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>• تنبيهات نشطة: <strong>{overview?.active_alerts ?? 0}</strong></p>
            <p>• آخر 24 ساعة: <strong>{last24.length}</strong></p>
            <p>• مركبات متصلة: <strong>{overview?.vehicles_online ?? 0}</strong> / {overview?.vehicles_total ?? 0}</p>
            <p>• أكثر نوع: {Object.entries(overview?.by_type ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ? EVENT_META[Object.entries(overview?.by_type ?? {}).sort((a, b) => b[1] - a[1])[0][0] as keyof typeof EVENT_META]?.labelAr : '—'}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
