import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { METRIC_DISPLAY } from '@/lib/trainingMetrics';
import { useProjectClasses } from '@/hooks/useDatasets';
import { useActiveModel, useInvalidateProjects } from '@/hooks/useProjects';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import { TrainingClassPicker } from '@/components/training/TrainingClassPicker';
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
import {
  applyCpuPresetValues,
  buildRetrainQuery,
  CPU_PRESETS,
  DEFAULT_CPU_PRESET,
  type CpuPreset,
  type CpuPresetDetails,
  type RetrainOverrides,
} from '@/lib/trainingPresets';
import { cancelTrainingJob } from '@/lib/cancelTraining';
import { TrainSourceModelPicker, type TrainSourceMode } from '@/components/training/TrainSourceModelPicker';

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
  metrics: Record<string, unknown>;
  classes_used?: string[];
  model_size_mb: number | null;
  created_at: string;
  model_number: number;
  is_active: boolean;
}

export default function UnifiedModelPage() {
  const { id: projectId } = useParams();
  const { data: status, refetch } = useActiveModel(projectId, { refetchInterval: 5000 });
  const { data: projectClasses = [] } = useProjectClasses(projectId);
  const { invalidateProject } = useInvalidateProjects();
  const runningJobId = status?.training.is_running ? status.training.job_id : null;
  const { job: runningJob, progressDetail, activityLog } = useTrainingJob(runningJobId);

  const [epochs, setEpochs] = useState(CPU_PRESETS[DEFAULT_CPU_PRESET].epochs);
  const [preset, setPreset] = useState<CpuPreset>(DEFAULT_CPU_PRESET);
  const [cpuPresetOptions, setCpuPresetOptions] = useState<CpuPresetDetails[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchSize, setBatchSize] = useState(8);
  const [learningRate, setLearningRate] = useState(0.001);
  const [imageSize, setImageSize] = useState(640);
  const [augmentation, setAugmentation] = useState('light');
  const [patience, setPatience] = useState(15);
  const [valSplit, setValSplit] = useState(0.15);
  const [optimizer, setOptimizer] = useState('AdamW');
  const [scheduler, setScheduler] = useState('cosine');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [sourceMode, setSourceMode] = useState<TrainSourceMode>('existing');
  const [sourceModelId, setSourceModelId] = useState('');
  const [architecture, setArchitecture] = useState('yolo11');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<'model' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadModels = useCallback(() => {
    if (!projectId) return;
    api.get<ModelArtifact[]>(`/api/v1/models/project/${projectId}`).then(setModels).catch(() => setModels([]));
  }, [projectId]);

  useEffect(() => { loadModels(); }, [loadModels]);

  useEffect(() => {
    api.get<{ cpu_presets: CpuPresetDetails[] }>('/api/v1/training/options')
      .then((o) => setCpuPresetOptions(o.cpu_presets ?? []))
      .catch(() => setCpuPresetOptions([]));
  }, []);

  useEffect(() => {
    if (!cpuPresetOptions.length) return;
    applyPresetSettings(preset);
  }, [cpuPresetOptions, preset, applyPresetSettings]);

  useEffect(() => {
    if (!projectClasses.length) {
      setSelectedClassIds([]);
      return;
    }
    setSelectedClassIds((prev) => {
      const valid = prev.filter((id) => projectClasses.some((c) => c.id === id));
      if (valid.length) return valid;
      const modelClassNames = normalizeClassesUsed(status?.model?.classes_used);
      if (modelClassNames.length) {
        const fromModel = projectClasses
          .filter((c) => modelClassNames.includes(c.name))
          .map((c) => c.id);
        if (fromModel.length) return fromModel;
      }
      return projectClasses.map((c) => c.id);
    });
  }, [projectClasses, status?.model?.classes_used]);

  const applyPresetSettings = useCallback((presetKey: CpuPreset) => {
    const details = cpuPresetOptions.find((p) => p.value === presetKey);
    if (!details) {
      setEpochs(CPU_PRESETS[presetKey]?.epochs ?? 20);
      return;
    }
    const values = applyCpuPresetValues(details);
    setEpochs(values.epochs);
    setBatchSize(values.batchSize);
    setLearningRate(values.learningRate);
    setOptimizer(values.optimizer);
    setScheduler(values.scheduler);
    setAugmentation(values.augmentation);
    setImageSize(values.imageSize);
    setValSplit(values.valSplit);
    setPatience(values.patience);
  }, [cpuPresetOptions]);

  useEffect(() => {
    if (!status) return;
    if (status.model?.architecture) setArchitecture(status.model.architecture);
    if (status.model?.id) {
      setSourceMode('existing');
      setSourceModelId(status.model.id);
      setPreset('fine_tune');
      return;
    }
    const rec = status.recommended_preset as CpuPreset | undefined;
    if (rec && rec in CPU_PRESETS) {
      setPreset(rec);
    }
    if (status.can_fine_tune) setSourceMode('existing');
  }, [
    status?.recommended_preset,
    status?.can_fine_tune,
    status?.model?.architecture,
    status?.model?.id,
  ]);

  const retrain = async () => {
    if (!projectId) return;
    if (selectedClassIds.length < 1) {
      window.alert('اختر فئة واحدة على الأقل للتقوية');
      return;
    }
    const strengthenId = sourceModelId || status?.model?.id;
    if (!strengthenId && sourceMode === 'existing') {
      window.alert('لا يوجد موديل موحد للتقوية. درّب موديلاً أولاً من Dataset Builder.');
      return;
    }
    setLoading(true);
    try {
      const query = buildRetrainQuery({
        epochs,
        architecture,
        preset,
        fineTune: sourceMode === 'existing',
        sourceModelArtifactId: sourceMode === 'existing' ? strengthenId : undefined,
        classIds: selectedClassIds,
      });
      const overrides: RetrainOverrides = {
        batch_size: batchSize,
        learning_rate: learningRate,
        image_size: imageSize,
        augmentation,
        patience,
        val_split: valSplit,
        optimizer,
        scheduler,
      };
      await api.post(`/api/v1/training/project/${projectId}/retrain?${query}`, overrides);
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

  const restoreModel = async (modelId: string) => {
    if (!projectId) return;
    if (!window.confirm('استعادة هذا النموذج كنموذج رئيسي للإنتاج؟')) return;
    setRestoringId(modelId);
    try {
      await api.patch(`/api/v1/models/${modelId}/lifecycle?lifecycle=production`);
      await refetch();
      loadModels();
      invalidateProject(projectId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to restore model');
    } finally {
      setRestoringId(null);
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
      <PageHeader title="الموديل الموحد · Unified Model">
        <Link to={`/projects/${projectId}/data`}>
          <Button variant="outline"><Database className="h-4 w-4" /> إضافة بيانات</Button>
        </Link>
        <Button
          onClick={retrain}
          disabled={loading || training?.is_running || (!model && sourceMode === 'existing')}
          variant="success"
        >
          {loading || training?.is_running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {training?.is_running ? 'جاري التقوية...' : model ? 'تقوية الموديل' : 'تدريب موديل جديد'}
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
                    <Badge variant="warning" className="gap-1"><AlertTriangle className="h-3 w-3" /> تدريب محاكى — أعد التدريب</Badge>
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
                {Boolean(model.metrics?.partial_training) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    النموذج الرئيسي مدرَّب على فئات محددة فقط. لإضافة فئات أخرى، درّبها ثم حدّد كل الفئات أو أعد تدريب الفئات الناقصة.
                  </div>
                )}
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
                {Array.isArray(model.metrics?.training_sessions) && model.metrics.training_sessions.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      جلسات التدريب · Training sessions ({model.metrics.training_sessions.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {[...model.metrics.training_sessions].reverse().map((s: Record<string, unknown>) => (
                        <div
                          key={String(s.session ?? s.job_id)}
                          className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">جلسة {String(s.session ?? '—')}</span>
                            {s.timestamp && (
                              <span className="text-muted-foreground">
                                {new Date(String(s.timestamp)).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                            {s.epochs != null && <span>{String(s.epochs)} epochs</span>}
                            {typeof (s.metrics as Record<string, unknown>)?.map50_95 === 'number' && (
                              <span>mAP {(Number((s.metrics as Record<string, unknown>).map50_95) * 100).toFixed(1)}%</span>
                            )}
                            {s.fine_tune_source && <span>من {String(s.fine_tune_source)}</span>}
                          </div>
                        </div>
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
            <CardTitle className="text-base">
              {model ? 'تقوية الموديل الموحد' : 'إعدادات التدريب'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary" className="gap-1 w-fit"><Cpu className="h-3 w-3" /> تدريب CPU</Badge>

            {model ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 px-3 py-3 text-sm space-y-1">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  سيستمر التدريب من نفس الموديل الموحد الحالي
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-200">
                  {model.name} · {model.architecture}
                  {model.metrics?.map50_95 != null && (
                    <> · الدقة الحالية {(model.metrics.map50_95 * 100).toFixed(1)}%</>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  لن يبدأ من الصفر — يُحمَّل نفس الأوزان، ثم يُحدَّث نفس الملف (مع نسخة احتياطية) دون إنشاء موديل جديد.
                </p>
              </div>
            ) : (
              <TrainSourceModelPicker
                projectId={projectId!}
                mode={sourceMode}
                onModeChange={setSourceMode}
                selectedModelId={sourceModelId}
                onSelectedModelIdChange={setSourceModelId}
                disabled={loading || training?.is_running}
              />
            )}

            <Select
              label="وضع التدريب"
              value={preset}
              onChange={(e) => onPresetChange(e.target.value as CpuPreset)}
            >
              {model ? (
                <>
                  <option value="fine_tune">{CPU_PRESETS.fine_tune.label}</option>
                  <option value="turbo_accuracy">{CPU_PRESETS.turbo_accuracy.label}</option>
                  <option value="hostinger_production">{CPU_PRESETS.hostinger_production.label}</option>
                  <option value="ultimate_accuracy">{CPU_PRESETS.ultimate_accuracy.label}</option>
                </>
              ) : (
                (Object.entries(CPU_PRESETS) as [CpuPreset, typeof CPU_PRESETS.fast_cpu][]).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))
              )}
            </Select>
            {CPU_PRESETS[preset]?.description && (
              <p className="text-[11px] text-muted-foreground -mt-2">{CPU_PRESETS[preset].description}</p>
            )}
            <Select label="Architecture" value={architecture} onChange={(e) => setArchitecture(e.target.value)} disabled={!!model}>
              <option value="yolo11">YOLO11</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs · الدورات</label>
              <Input type="number" min={5} max={200} value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </div>

            <TrainingClassPicker
              classes={projectClasses}
              selectedIds={selectedClassIds}
              onChange={setSelectedClassIds}
              disabled={loading || training?.is_running}
              compact
            />

            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'إخفاء الإعدادات المتقدمة' : 'إعدادات التدريب المتقدمة'}
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Batch Size</label>
                    <Input type="number" min={1} max={64} value={batchSize} onChange={(e) => setBatchSize(+e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Image Size</label>
                    <Input type="number" step={32} min={320} max={1280} value={imageSize} onChange={(e) => setImageSize(+e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Learning Rate</label>
                    <Input type="number" step={0.0001} min={0.0001} max={0.1} value={learningRate} onChange={(e) => setLearningRate(+e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Patience</label>
                    <Input type="number" min={1} max={100} value={patience} onChange={(e) => setPatience(+e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Val Split</label>
                    <Input type="number" step={0.01} min={0.05} max={0.4} value={valSplit} onChange={(e) => setValSplit(+e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Augmentation</label>
                    <Select value={augmentation} onChange={(e) => setAugmentation(e.target.value)}>
                      <option value="none">None</option>
                      <option value="light">Light</option>
                      <option value="medium">Medium</option>
                      <option value="heavy">Heavy</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Optimizer</label>
                    <Select value={optimizer} onChange={(e) => setOptimizer(e.target.value)}>
                      <option value="AdamW">AdamW</option>
                      <option value="Adam">Adam</option>
                      <option value="SGD">SGD</option>
                      <option value="RMSProp">RMSProp</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Scheduler</label>
                    <Select value={scheduler} onChange={(e) => setScheduler(e.target.value)}>
                      <option value="cosine">Cosine</option>
                      <option value="linear">Linear</option>
                      <option value="step">Step</option>
                      <option value="onecycle">OneCycle</option>
                      <option value="none">None</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {models.length > 1 && model && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  تغيير الموديل المصدر ({models.length} موديلات)
                </summary>
                <div className="mt-2">
                  <TrainSourceModelPicker
                    projectId={projectId!}
                    mode={sourceMode}
                    onModeChange={setSourceMode}
                    selectedModelId={sourceModelId || model.id}
                    onSelectedModelIdChange={setSourceModelId}
                    disabled={loading || training?.is_running}
                    compact
                  />
                </div>
              </details>
            )}

            <Button
              className="w-full"
              onClick={retrain}
              disabled={loading || training?.is_running || selectedClassIds.length < 1 || (sourceMode === 'existing' && !sourceModelId && !model)}
            >
              {preset === 'fast_cpu' ? <Zap className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {model ? 'تقوية الموديل الموحد' : 'بدء التدريب'}
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

      {models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">سجل النماذج</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {models.map((m) => {
              const historyClasses = normalizeClassesUsed(m.classes_used);
              const isActive = m.lifecycle === 'production';
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="space-y-1">
                    <div>
                      <span className="text-xs font-mono bg-muted px-1 rounded mr-1">#{m.model_number}</span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground ml-2">{m.architecture} · {m.lifecycle}</span>
                      {Boolean(m.metrics?.partial_training) && (
                        <Badge variant="warning" className="ml-2 text-[10px]">فئات محددة</Badge>
                      )}
                    </div>
                    {historyClasses.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {historyClasses.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoringId === m.id || training?.is_running}
                        onClick={() => restoreModel(m.id)}
                      >
                        {restoringId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        استعادة
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
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
