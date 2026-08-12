import { useMemo } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/shared/StatCard';
import { DemoOnboardingBanner } from '@/components/shared/DemoOnboardingBanner';
import { QueryState, ChartEmpty } from '@/components/shared/QueryState';
import { useOverview, useAlerts } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { RECIPIENT_META, IRAQ_GOVERNORATES, guessGovernorate, EVENT_META } from '@/lib/constants';
import { alertsByHour, avgConfidence, resolveRate, alertsLast24h } from '@/lib/analytics';
import { BarChart3, TrendingUp, Clock, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

export default function AnalyticsPage() {
  const { projectId } = useControlContext();
  const { data: overview, isError, error, refetch } = useOverview(projectId);
  const { data: alerts = [], isLoading } = useAlerts(projectId, { activeOnly: false });

  const last24 = useMemo(() => alertsLast24h(alerts), [alerts]);
  const hourly = useMemo(() => alertsByHour(last24.length ? last24 : alerts), [alerts, last24]);
  const confidence = avgConfidence(alerts);
  const resolvePct = resolveRate(alerts);

  const govData = IRAQ_GOVERNORATES.map((g) => {
    const count = alerts.filter((a) => (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === g.id).length;
    return { name: g.nameAr, count };
  }).filter((d) => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 10);

  const typePie = Object.entries(
    alerts.reduce<Record<string, number>>((acc, a) => {
      acc[a.event_type] = (acc[a.event_type] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({
    name: EVENT_META[k as keyof typeof EVENT_META]?.labelAr ?? k,
    value: v,
    color: EVENT_META[k as keyof typeof EVENT_META]?.color ?? '#64748b',
  }));

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="التحليلات" subtitle="إحصائيات حقيقية من شبكة راصد — العراق" />

      <div className="page-body">
        <QueryState isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()}>
        <DemoOnboardingBanner projectId={projectId} alertsCount={alerts.length} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={BarChart3} label="إجمالي نشط" value={overview?.active_alerts ?? 0} tone="info" />
          <StatCard icon={TrendingUp} label="معدل الحل" value={`${resolvePct}%`} tone="success" hint={`${overview?.resolved_total ?? 0} منتهية`} />
          <StatCard icon={Clock} label="آخر 24 ساعة" value={last24.length} tone="warning" hint="حدث" />
          <StatCard icon={Target} label="دقة AI" value={confidence != null ? `${confidence}%` : '—'} tone="success" hint="متوسط الثقة" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>أكثر المحافظات بلاغاً</CardTitle></CardHeader>
            <CardContent className="h-72">
              {govData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={govData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>نشاط الساعات (بيانات فعلية)</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="events" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>توزيع حسب الجهة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(RECIPIENT_META).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-border bg-muted/30 p-4 transition hover:shadow-sm">
                    <p className="font-bold" style={{ color: v.color }}>{v.labelAr}</p>
                    <p className="text-2xl font-bold">{overview?.by_recipient?.[k] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{v.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>أنواع الأحداث</CardTitle></CardHeader>
            <CardContent className="h-64">
              {typePie.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {typePie.map((e, i) => <Cell key={i} fill={e.color} />)}
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
        </QueryState>
      </div>
    </div>
  );
}
