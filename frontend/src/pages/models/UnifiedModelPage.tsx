import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { METRIC_DISPLAY } from '@/lib/trainingMetrics';
import { useActiveModel, useInvalidateProjects } from '@/hooks/useProjects';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { TrainingProgressCard } from '@/components/training/TrainingProgressCard';
import { TrainingActivityLog } from '@/components/training/TrainingActivityLog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Brain, RefreshCw, Link2, Map, Truck, PenTool, Activity, Database, Play, Loader2, Trash2, Cpu, AlertTriangle, Zap,
} from 'lucide-react';
import { buildRetrainQuery, CPU_PRESETS, DEFAULT_CPU_PRESET, type CpuPreset } from '@/lib/trainingPresets';
import { cancelTrainingJob } from '@/lib/cancelTraining';

function normalizeClassesUsed(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.includes(',') ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [raw.trim()];
  }
  return [];
}

function formatMetricPct(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

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
  const { job: runningJob, progressDetail, activityLog } = useTrainingJob(runningJobId);

  const [epochs, setEpochs] = useState(CPU_PRESETS[DEFAULT_CPU_PRESET].epochs);
  const [preset, setPreset] = useState<CpuPreset>(DEFAULT_CPU_PRESET);
  const [fineTune, setFineTune] = useState(true);
  const [architecture, setArchitecture] = useState('yolo11');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<'model' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const loadModels = useCallback(() => {
    if (!projectId) return;
    api.get<ModelArtifact[]>(`/api/v1/models/project/${projectId}`).then(setModels).catch(() => setModels([]));
  }, [projectId]);

  useEffect(() => { loadModels(); }, [loadModels]);

  useEffect(() => {
    if (!status) return;
    const rec = status.recommended_preset as CpuPreset | undefined;
    if (rec && rec in CPU_PRESETS) {
      setPreset(rec);
      setEpochs(CPU_PRESETS[rec].epochs);
    }
    if (status.can_fine_tune) setFineTune(true);
    if (status.model?.architecture) setArchitecture(status.model.architecture);
  }, [status?.recommended_preset, status?.can_fine_tune, status?.model?.architecture]);

  const retrain = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const query = buildRetrainQuery({ epochs, architecture, preset, fineTune });
      await api.post(`/api/v1/training/project/${projectId}/retrain?${query}`);
      await refetch();
      invalidateProject(projectId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to start training');
    } finally {
      setLoading(false);
    }
  };

  const onPresetChange = (value: CpuPreset) => {
    setPreset(value);
    setEpochs(CPU_PRESETS[value].epochs);
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
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete model');
    } finally {
      setDeleting(false);
    }
  };

  const stopTraining = async () => {
    const jobId = status?.training.job_id ?? runningJob?.id;
    if (!jobId) return;
    if (!window.confirm('Stop training? Progress will be lost.')) return;
    setStopping(true);
    try {
      await cancelTrainingJob(jobId);
      await refetch();
      invalidateProject(projectId!);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to stop training');
    } finally {
      setStopping(false);
    }
  };

  const model = status?.model;
  const modelClasses = normalizeClassesUsed(model?.classes_used);
  const training = status?.training;
  const progress = runningJob?.progress ?? training?.progress ?? 0;
  const currentEpoch = runningJob?.current_epoch ?? training?.current_epoch ?? 0;
  const totalEpochs = runningJob?.total_epochs ?? training?.total_epochs ?? 0;
  const phase = runningJob?.phase;
  const message = runningJob?.message;
  const batch = runningJob?.batch;
  const totalBatches = runningJob?.total_batches;

  return (
    <div className="space-y-6">
      <PageHeader title="Project Model">
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
        <div className="space-y-3">
          <TrainingProgressCard
            progress={progress}
            currentEpoch={currentEpoch}
            totalEpochs={totalEpochs}
            durationSeconds={runningJob?.duration_seconds}
            deviceLabel={training.device_label ?? 'CPU Training'}
            status={training.status ?? 'running'}
            jobName={training.name ?? undefined}
            phase={phase}
            message={message}
            batch={batch}
            totalBatches={totalBatches}
            detail={progressDetail}
            onStop={stopTraining}
            stopping={stopping}
          />
          {activityLog.length > 0 && <TrainingActivityLog entries={activityLog} />}
        </div>
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
                {model && (
                  <p className="text-sm text-muted-foreground">
                    {new Date(model.updated_at).toLocaleString()}
                  </p>
                )}
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
                    { label: METRIC_DISPLAY.detectionAccuracy.label, value: model.metrics?.map50 },
                    { label: METRIC_DISPLAY.accuracy.label, value: model.metrics?.map50_95 },
                    { label: 'Precision', value: model.metrics?.precision },
                    { label: 'Recall', value: model.metrics?.recall },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-secondary/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-bold">{formatMetricPct(value)}</p>
                    </div>
                  ))}
                </div>
                {modelClasses.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Classes</p>
                    <div className="flex flex-wrap gap-1">
                      {modelClasses.map((c) => (
                        <Badge key={c} variant="secondary">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
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
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary" className="gap-1 w-fit"><Cpu className="h-3 w-3" /> CPU Training</Badge>
            <Select
              label="CPU preset"
              value={preset}
              onChange={(e) => onPresetChange(e.target.value as CpuPreset)}
            >
              {(Object.entries(CPU_PRESETS) as [CpuPreset, typeof CPU_PRESETS.fast_cpu][]).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </Select>
            <Select label="Architecture" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              <option value="yolo11">YOLO11</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
              <Input type="number" min={5} max={200} value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={fineTune}
                onChange={(e) => setFineTune(e.target.checked)}
                disabled={!status?.can_fine_tune}
              />
              Fine-tune from Main Model
            </label>
            <Button className="w-full" onClick={retrain} disabled={loading || training?.is_running}>
              {preset === 'fast_cpu' ? <Zap className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {preset === 'fast_cpu' ? 'Fast CPU Retrain' : 'Retrain on latest data'}
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
