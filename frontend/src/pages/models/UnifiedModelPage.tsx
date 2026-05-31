import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Brain, RefreshCw, Link2, Map, Truck, PenTool, Activity, Database, Play, Loader2,
} from 'lucide-react';

interface ActiveModelStatus {
  project_id: string;
  project_name: string;
  has_model: boolean;
  model: {
    id: string;
    name: string;
    architecture: string;
    lifecycle: string;
    metrics: Record<string, number>;
    classes_used: string[];
    model_size_mb: number;
    updated_at: string;
  } | null;
  training: {
    is_running: boolean;
    job_id: string | null;
    status: string | null;
    name: string | null;
  };
  live_endpoint: string | null;
  connected_services: { id: string; name: string; uses: string }[];
}

const serviceIcons: Record<string, typeof Map> = {
  road_intelligence: Map,
  fleet: Truck,
  annotation: PenTool,
  monitoring: Activity,
  dataset_builder: Database,
};

export default function UnifiedModelPage() {
  const { id: projectId } = useParams();
  const [status, setStatus] = useState<ActiveModelStatus | null>(null);
  const [epochs, setEpochs] = useState(20);
  const [architecture, setArchitecture] = useState('yolo11');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    api.get<ActiveModelStatus>(`/api/v1/projects/${projectId}/active-model`).then(setStatus).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const retrain = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      await api.post(`/api/v1/training/project/${projectId}/retrain?epochs=${epochs}&architecture=${architecture}`);
      load();
    } finally {
      setLoading(false);
    }
  };

  const model = status?.model;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Model"
        description="One model per project — retrain continuously. All services use this model automatically."
      >
        <Link to={`/projects/${projectId}/data`}>
          <Button variant="outline"><Database className="h-4 w-4" /> Add data</Button>
        </Link>
        <Button onClick={retrain} disabled={loading || status?.training.is_running} variant="success">
          {loading || status?.training.is_running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {status?.training.is_running ? 'Training...' : 'Retrain Model'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {model ? model.name : 'No model yet'}
            </CardTitle>
            <CardDescription>
              {model
                ? `Last updated ${new Date(model.updated_at).toLocaleString()}`
                : 'Upload images in Dataset Builder, then click Retrain Model'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {model ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{model.architecture}</Badge>
                  <Badge variant="success">{model.lifecycle}</Badge>
                  {model.model_size_mb != null && (
                    <Badge variant="outline">{model.model_size_mb.toFixed(1)} MB</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'mAP50', value: model.metrics?.map50 },
                    { label: 'mAP50-95', value: model.metrics?.map50_95 },
                    { label: 'Precision', value: model.metrics?.precision },
                    { label: 'Recall', value: model.metrics?.recall },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-secondary/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-bold">
                        {value != null ? `${(value * 100).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
                {model.classes_used?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Classes</p>
                    <div className="flex flex-wrap gap-1">
                      {model.classes_used.map((c) => (
                        <Badge key={c} variant="secondary">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Train once to activate the project model.</p>
                <Link to={`/projects/${projectId}/data`}>
                  <Button className="mt-3" size="sm">Go to Dataset Builder</Button>
                </Link>
              </div>
            )}

            {status?.live_endpoint && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-800">
                  Live API: <code className="text-xs">{status.live_endpoint}</code>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retrain settings</CardTitle>
            <CardDescription>Same model slot — weights update after each run</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select label="Architecture" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              <option value="yolo11">YOLO11</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
              <Input type="number" min={5} max={200} value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </div>
            <Button className="w-full" onClick={retrain} disabled={loading || status?.training.is_running}>
              <Play className="h-4 w-4" />
              Retrain on latest data
            </Button>
            {status?.training.is_running && status.training.job_id && (
              <Link to={`/projects/${projectId}/training`} className="block text-center text-sm text-primary underline">
                View training progress →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
          <CardDescription>These modules automatically use the active project model — no separate deploy step</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(status?.connected_services ?? []).map((svc) => {
            const Icon = serviceIcons[svc.id] ?? Link2;
            return (
              <div key={svc.id} className="flex gap-3 rounded-xl border border-border/60 bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-sm">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">{svc.uses}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
