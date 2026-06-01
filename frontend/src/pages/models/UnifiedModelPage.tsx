import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useActiveModel, useInvalidateProjects } from '@/hooks/useProjects';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { TrainingProgressCard } from '@/components/training/TrainingProgressCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Brain, RefreshCw, Link2, Map, Truck, PenTool, Activity, Database, Play, Loader2, Trash2, Cpu, AlertTriangle,
} from 'lucide-react';

const serviceIcons: Record<string, typeof Map> = {
  road_intelligence: Map,
  fleet: Truck,
  annotation: PenTool,
  monitoring: Activity,
  dataset_builder: Database,
};

interface ModelArtifact {
  id: string;
  name: string;
  architecture: string;
  lifecycle: string;
  metrics: Record<string, number>;
  model_size_mb: number | null;
  created_at: string;
}

export default function UnifiedModelPage() {
  const { id: projectId } = useParams();
  const { data: status, refetch } = useActiveModel(projectId, { refetchInterval: 5000 });
  const { invalidateProject } = useInvalidateProjects();
  const runningJobId = status?.training.is_running ? status.training.job_id : null;
  const { job: runningJob } = useTrainingJob(runningJobId);

  const [epochs, setEpochs] = useState(20);
  const [architecture, setArchitecture] = useState('yolo11');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<'model' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModels = useCallback(() => {
    if (!projectId) return;
    api.get<ModelArtifact[]>(`/api/v1/models/project/${projectId}`).then(setModels).catch(() => setModels([]));
  }, [projectId]);

  useEffect(() => { loadModels(); }, [loadModels]);

  const retrain = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      await api.post(`/api/v1/training/project/${projectId}/retrain?epochs=${epochs}&architecture=${architecture}`);
      await refetch();
      invalidateProject(projectId);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (password: string) => {
    if (!projectId || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'model' && status?.model?.id) {
        await api.deleteWithBody(`/api/v1/models/${status.model.id}`, { password });
      } else if (deleteTarget === 'all') {
        await api.deleteWithBody(`/api/v1/projects/${projectId}/models?delete_jobs=true`, { password });
      }
      setDeleteTarget(null);
      await refetch();
      loadModels();
      invalidateProject(projectId);
    } finally {
      setDeleting(false);
    }
  };

  const model = status?.model;
  const training = status?.training;
  const progress = runningJob?.progress ?? training?.progress ?? 0;
  const currentEpoch = runningJob?.current_epoch ?? training?.current_epoch ?? 0;
  const totalEpochs = runningJob?.total_epochs ?? training?.total_epochs ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Model"
        description="One model per project — train on CPU, retrain continuously, all services use it automatically."
      >
        <Link to={`/projects/${projectId}/data`}>
          <Button variant="outline"><Database className="h-4 w-4" /> Add data</Button>
        </Link>
        <Button onClick={retrain} disabled={loading || training?.is_running} variant="success">
          {loading || training?.is_running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {training?.is_running ? 'Training...' : 'Retrain Model'}
        </Button>
      </PageHeader>

      {training?.is_running && (
        <TrainingProgressCard
          progress={progress}
          currentEpoch={currentEpoch}
          totalEpochs={totalEpochs}
          durationSeconds={runningJob?.duration_seconds}
          deviceLabel={training.device_label ?? 'CPU Training'}
          status={training.status ?? 'running'}
          jobName={training.name ?? undefined}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-primary/20">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  {model ? model.name : 'No model yet'}
                </CardTitle>
                <CardDescription>
                  {model
                    ? `Last updated ${new Date(model.updated_at).toLocaleString()}`
                    : 'Upload images in Dataset Builder, then click Retrain Model'}
                </CardDescription>
              </div>
              {model && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteTarget('model')}>
                    <Trash2 className="h-4 w-4" /> Delete model
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {model ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{model.architecture}</Badge>
                  <Badge variant="success">{model.lifecycle}</Badge>
                  <Badge variant="secondary" className="gap-1"><Cpu className="h-3 w-3" /> {model.gpu_used ?? 'cpu'}</Badge>
                  {model.is_mock && (
                    <Badge variant="warning" className="gap-1"><AlertTriangle className="h-3 w-3" /> Mock weights</Badge>
                  )}
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
            <CardDescription>CPU training · same model slot after each run</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary" className="gap-1 w-fit"><Cpu className="h-3 w-3" /> CPU Training</Badge>
            <Select label="Architecture" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              <option value="yolo11">YOLO11</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
              <Input type="number" min={5} max={200} value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </div>
            <Button className="w-full" onClick={retrain} disabled={loading || training?.is_running}>
              <Play className="h-4 w-4" />
              Retrain on latest data
            </Button>
            {training?.is_running && training.job_id && (
              <Link to={`/projects/${projectId}/training`} className="block text-center text-sm text-primary underline">
                View training progress →
              </Link>
            )}
            {(model || models.length > 0) && (
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setDeleteTarget('all')}
                disabled={training?.is_running}
              >
                <Trash2 className="h-4 w-4" /> Reset all models & jobs
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {models.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model history</CardTitle>
            <CardDescription>Previous training runs (archived after retrain)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {models.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground ml-2">{m.architecture} · {m.lifecycle}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
          <CardDescription>These modules automatically use the active project model</CardDescription>
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

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={deleteTarget === 'all' ? 'Reset all project models?' : 'Delete active model?'}
        description={
          deleteTarget === 'all'
            ? 'This removes all trained models, weights in storage, and training job history for this project.'
            : 'This permanently deletes the active model weights. Services will have no model until you train again.'
        }
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
