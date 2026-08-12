import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSystemStatus } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { Link2, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

const kindLabel: Record<string, string> = {
  database: 'قاعدة بيانات',
  cache: 'ذاكرة مؤقتة',
  inference: 'استدلال سحابي',
  realtime: 'وقت حقيقي',
  ml: 'تعلم آلي',
};

const statusStyle: Record<string, string> = {
  connected: 'bg-emerald-500',
  ready: 'bg-emerald-500',
  offline: 'bg-amber-500',
  error: 'bg-red-500',
  needs_key: 'bg-amber-500',
};

export default function IntegrationsPage() {
  const { projectId } = useControlContext();
  const { data: system, isLoading } = useSystemStatus(projectId);

  const connected = system?.integrations.filter((i) => i.status === 'connected' || i.status === 'ready').length ?? 0;
  const total = system?.integrations.length ?? 0;

  return (
    <div className="page-shell animate-fade-in">
      <TopBar
        title="التكاملات"
        subtitle={`${connected}/${total} خدمات متصلة · REST · WS · Cloud AI · Edge`}
        live
      />

      <div className="page-body">
        {isLoading && <p className="text-muted-foreground">جاري التحميل...</p>}

        <Card className="mb-6 ring-1 ring-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              نظرة على التكامل
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>لوحة راصد v4 تربط بين أجهزة الأسطول، قاعدة البيانات، Redis، WebSocket، وUltralytics Cloud للمختبر.</p>
            <p className="mt-2">المشروع: <code className="rounded bg-muted px-1">{projectId}</code></p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {system?.integrations.map((item) => (
            <Card key={item.id} className={item.status === 'connected' || item.status === 'ready' ? 'ring-1 ring-primary/15' : ''}>
              <CardHeader className="flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <span className={cn('h-2.5 w-2.5 rounded-full', statusStyle[item.status] ?? 'bg-muted')} />
                  <div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{kindLabel[item.kind] ?? item.kind}</p>
                  </div>
                </div>
                <Badge className="border text-[10px]">{item.status}</Badge>
              </CardHeader>
              <CardContent>
                {item.detail ? (
                  <p className="text-sm">{item.detail}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
                <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Link2 className="h-3 w-3" /> id: {item.id}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
