import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MonitoringPage() {
  const { id } = useParams();
  const [deployments, setDeployments] = useState<{ id: string; name: string; status: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ confidence: number; latency_ms: number; is_false_positive: boolean; created_at: string }[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; alert_type: string; severity: string; message: string; is_acknowledged: boolean }[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<typeof deployments>(`/api/v1/deployments/project/${id}`).then(setDeployments).catch(() => {});
  }, [id]);

  const loadMonitoring = async (depId: string) => {
    setSelected(depId);
    const [l, a] = await Promise.all([
      api.get<typeof logs>(`/api/v1/monitoring/${depId}/logs`),
      api.get<typeof alerts>(`/api/v1/monitoring/${depId}/alerts`),
    ]);
    setLogs(l);
    setAlerts(a);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Model Monitoring</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Deployments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {deployments.map((d) => (
              <button key={d.id} onClick={() => loadMonitoring(d.id)} className={`w-full text-left p-2 rounded ${selected === d.id ? 'bg-primary/10' : 'hover:bg-accent'}`}>
                {d.name} ({d.status})
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Drift Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-auto">
            {alerts.map((a) => (
              <div key={a.id} className={`p-3 rounded border ${a.severity === 'critical' ? 'border-red-500/50' : 'border-yellow-500/50'}`}>
                <p className="text-sm font-medium">{a.alert_type} — {a.severity}</p>
                <p className="text-xs text-muted-foreground">{a.message}</p>
                {!a.is_acknowledged && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    await api.post(`/api/v1/monitoring/alerts/${a.id}/acknowledge`);
                    if (selected) loadMonitoring(selected);
                  }}>
                    Acknowledge
                  </Button>
                )}
              </div>
            ))}
            {alerts.length === 0 && <p className="text-muted-foreground">No alerts</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Inference Logs</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-auto text-sm">
            {logs.map((l, i) => (
              <div key={i} className="flex justify-between p-1 border-b border-border">
                <span>Conf: {(l.confidence * 100).toFixed(0)}%</span>
                <span>{l.latency_ms?.toFixed(0)}ms</span>
                {l.is_false_positive && <span className="text-red-400">FP</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
