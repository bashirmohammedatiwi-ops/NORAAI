import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryState } from '@/components/shared/QueryState';
import { useSystemStatus, useRoadStats } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import {
  Activity, Brain, Car, Database, Radio, Server, Shield, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusBadge: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  connected: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  offline: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  needs_key: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const statusLabel: Record<string, string> = {
  ok: 'يعمل',
  connected: 'متصل',
  ready: 'جاهز',
  offline: 'غير متصل',
  error: 'خطأ',
  needs_key: 'يحتاج مفتاح',
};

function ServiceCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: typeof Database;
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <Badge className={cn('border', statusBadge[status] ?? statusBadge.offline)}>
          {statusLabel[status] ?? status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

export default function SystemPage() {
  const { projectId, wsConnected } = useControlContext();
  const { data: system, isLoading, isError, error, refetch } = useSystemStatus(projectId);
  const { data: stats } = useRoadStats(projectId);

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="صحة النظام" subtitle="مراقبة الخدمات والبنية التحتية — Rasid v4" live />

      <div className="page-body">
        <QueryState isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()}>
        {system && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="ring-1 ring-primary/10">
                <CardContent className="flex items-center gap-4 p-5">
                  <Shield className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">إصدار المنصة</p>
                    <p className="text-xl font-black">v{system.version}</p>
                    <p className="text-xs">{system.service}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <Car className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">الأسطول</p>
                    <p className="text-xl font-black">{system.fleet.online}/{system.fleet.total}</p>
                    <p className="text-xs">مركبة متصلة</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <Brain className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">النموذج النشط</p>
                    <p className="text-sm font-bold">{system.active_model.name ?? '—'}</p>
                    <p className="text-xs">{system.active_model.architecture ?? 'غير مفعّل'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <Activity className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">اكتشافات الطرق</p>
                    <p className="text-xl font-black">{stats?.road_issues_detected ?? '—'}</p>
                    <p className="text-xs">إجمالي المشاكل</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ServiceCard icon={Database} title="PostgreSQL" status={system.database.status}>
                <p>قاعدة البيانات الرئيسية للتنبيهات والأسطول والنماذج.</p>
                <p>Endpoint: <code className="rounded bg-muted px-1">/health/ready</code></p>
              </ServiceCard>

              <ServiceCard icon={Server} title="Redis" status={system.redis.status}>
                <p>ذاكرة مؤقتة وPub/Sub للتحديثات الحية.</p>
              </ServiceCard>

              <ServiceCard
                icon={Zap}
                title="Ultralytics Lab"
                status={system.lab.api_key_configured && system.lab.configured ? 'connected' : system.lab.configured ? 'needs_key' : 'offline'}
              >
                <p>{system.lab.endpoint_label}</p>
                {system.lab.url_host && <p>Host: <code className="rounded bg-muted px-1">{system.lab.url_host}</code></p>}
                <p>مفتاح API: {system.lab.api_key_configured ? 'مُضبط على الخادم ✓' : 'غير مُضبط'}</p>
              </ServiceCard>

              <ServiceCard icon={Radio} title="WebSocket" status={wsConnected ? 'connected' : system.websocket.status}>
                <p>بث التنبيهات الفوري للوحة التحكم.</p>
                <p>{wsConnected ? 'متصل الآن باللوحة ✓' : 'في انتظار الاتصال من المتصفح'}</p>
                <p className="break-all"><code className="rounded bg-muted px-1 text-xs">{system.websocket.path}</code></p>
              </ServiceCard>
            </div>
          </>
        )}
        </QueryState>
      </div>
    </div>
  );
}
