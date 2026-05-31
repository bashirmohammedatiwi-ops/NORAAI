import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const targets = ['docker', 'rest_api', 'vps', 'edge', 'raspberry_pi'];

export default function DeploymentsPage() {
  const { id } = useParams();
  const [deployments, setDeployments] = useState<{ id: string; name: string; target: string; status: string; endpoint_url: string | null }[]>([]);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('docker');

  const load = () => {
    if (!id) return;
    api.get<typeof deployments>(`/api/v1/deployments/project/${id}`).then(setDeployments).catch(() => {});
    api.get<typeof models>(`/api/v1/models/project/${id}`).then(setModels).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const deploy = async () => {
    if (!selectedModel) return;
    await api.post(`/api/v1/deployments/project/${id}`, {
      name: `Deploy ${selectedTarget}`,
      model_artifact_id: selectedModel,
      target: selectedTarget,
    });
    load();
  };

  const statusColor = (s: string) => ({
    active: 'text-green-400',
    testing: 'text-yellow-400',
    staging: 'text-blue-400',
    archived: 'text-gray-400',
  }[s] || 'text-gray-400');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Deployment Center</h1>

      <Card>
        <CardHeader><CardTitle>One-Click Deploy</CardTitle></CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="text-sm text-muted-foreground">Model</label>
            <select className="block mt-1 w-48 h-10 rounded border border-border bg-background px-2" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              <option value="">Select model</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Target</label>
            <select className="block mt-1 w-48 h-10 rounded border border-border bg-background px-2" value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
              {targets.map((t) => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
            </select>
          </div>
          <Button onClick={deploy}>Deploy</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Deployments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {deployments.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded border border-border">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-sm text-muted-foreground">{d.target} → {d.endpoint_url || 'Pending...'}</p>
              </div>
              <span className={`text-sm font-medium ${statusColor(d.status)}`}>{d.status.toUpperCase()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
