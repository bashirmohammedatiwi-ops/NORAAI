import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCard } from '@/components/alerts/AlertCard';
import { LiveMap } from '@/components/map/LiveMap';
import { StatCard, SectionHeader } from '@/components/shared/StatCard';
import { QuickActions } from '@/components/shared/QuickActions';
import { DemoOnboardingBanner } from '@/components/shared/DemoOnboardingBanner';
import { QueryState, ChartEmpty } from '@/components/shared/QueryState';
import { useOverview, useAlerts, useFleet } from '@/hooks/useControlCenter';
import { useControlContext, filterAlerts } from '@/context/ControlContext';
import { EVENT_META, RECIPIENT_META, guessGovernorate } from '@/lib/constants';
import { avgConfidence, resolveRate } from '@/lib/analytics';
import { useShowFleetOnMap } from '@/context/PreferencesContext';
import { AlertTriangle, CheckCircle, Truck, MapPin, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function OverviewPage() {
  const { projectId, governorateFilter, searchQuery } = useControlContext();
  const { data: overview, isError: overviewError, error: overviewErr, refetch: refetchOverview } = useOverview(projectId);
  const { data: alertsRaw = [], isLoading } = useAlerts(projectId);
  const { data: allAlerts = [] } = useAlerts(projectId, { activeOnly: false });
  const { data: fleet = [] } = useFleet(projectId);

  const alerts = filterAlerts(alertsRaw, governorateFilter, searchQuery, guessGovernorate);
  const activeFiltered = alerts.filter((a) => a.is_active);
  const confidence = avgConfidence(alertsRaw);
  const resolvePct = resolveRate(allAlerts);
  const recentAlerts = filterAlerts(allAlerts, governorateFilter, searchQuery, guessGovernorate)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);
  const mapVehicles = useShowFleetOnMap() ? fleet : [];

  const recipientChart = Object.entries(overview?.by_recipient ?? {}).map(([k, v]) => ({
    name: RECIPIENT_META[k as keyof typeof RECIPIENT_META]?.labelAr ?? k,
    count: v,
  }));

  const typeChart = Object.entries(overview?.by_type ?? {}).map(([k, v]) => ({
    name: EVENT_META[k as keyof typeof EVENT_META]?.labelAr ?? k,
    value: v,
    color: EVENT_META[k as keyof typeof EVENT_META]?.color ?? '#64748b',
  }));

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="نظرة عامة" subtitle="لوحة القيادة المركزية — جمهورية العراق v4" live />

      <div className="page-body">
        <QueryState isError={overviewError} error={overviewErr} onRetry={() => refetchOverview()}>
        <DemoOnboardingBanner projectId={projectId} alertsCount={alertsRaw.length} fleetCount={fleet.length} />
        <QuickActions />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={AlertTriangle} label="تنبيهات نشطة" value={overview?.active_alerts ?? 0} tone="danger" hint="عبر العراق" trend={activeFiltered.length !== (overview?.active_alerts ?? 0) ? `${activeFiltered.length} مفلتر` : undefined} />
          <StatCard icon={Truck} label="مركبات متصلة" value={`${overview?.vehicles_online ?? 0}/${overview?.vehicles_total ?? 0}`} tone="success" />
          <StatCard icon={CheckCircle} label="معدل الحل" value={`${resolvePct}%`} tone="default" hint={`${overview?.resolved_total ?? 0} منتهية`} />
          <StatCard icon={TrendingUp} label="دقة AI" value={confidence != null ? `${confidence}%` : '—'} tone="info" hint="متوسط الثقة" />
          <StatCard icon={MapPin} label="محافظات" value={Object.keys(overview?.by_municipality ?? {}).filter((k) => k !== 'unknown').length || '—'} tone="info" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="xl:col-span-1 transition-shadow hover:shadow-md">
            <CardHeader><CardTitle>حسب الجهة</CardTitle></CardHeader>
            <CardContent className="h-52">
              {recipientChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recipientChart}>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </CardContent>
          </Card>

          <Card className="transition-shadow hover:shadow-md">
            <CardHeader><CardTitle>أنواع الأحداث</CardTitle></CardHeader>
            <CardContent className="h-52">
              {typeChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                      {typeChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>الخريطة الحية — {alerts.filter((a) => a.is_active).length} نشط</CardTitle>
            <Link to="/map" className="text-sm font-semibold text-primary hover:underline">فتح كامل ←</Link>
          </CardHeader>
          <CardContent>
            <LiveMap alerts={alerts.filter((a) => a.is_active).slice(0, 50)} vehicles={mapVehicles} height="320px" zoom={6} />
          </CardContent>
        </Card>

        <SectionHeader
          title="أحدث التنبيهات"
          desc="مع صورة الدليل المرئي"
          action={<Link to="/activity" className="text-sm font-semibold text-primary">سجل النشاط ←</Link>}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {isLoading && <p className="text-sm text-muted-foreground">جاري تحميل التنبيهات...</p>}
          {!isLoading && !recentAlerts.length && (
            <ChartEmpty message="لا تنبيهات بعد" />
          )}
          {recentAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
        </QueryState>
      </div>
    </div>
  );
}
