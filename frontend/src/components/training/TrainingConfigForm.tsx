import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Play, Sparkles } from 'lucide-react';

interface TrainingOptions {
  architectures: { value: string; label: string; description: string }[];
  training_modes: { value: string; label: string }[];
  optimizers: string[];
  schedulers: string[];
  augmentation_presets: { value: string; label: string }[];
  defaults: Record<string, unknown>;
}

interface Props {
  projectId: string;
  onStarted: () => void;
}

export function TrainingConfigForm({ projectId, onStarted }: Props) {
  const [options, setOptions] = useState<TrainingOptions | null>(null);
  const [datasets, setDatasets] = useState<{ id: string; name: string; head_version_id?: string | null }[]>([]);
  const [versions, setVersions] = useState<{ id: string; version_tag: string }[]>([]);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const [name, setName] = useState('');
  const [architecture, setArchitecture] = useState('yolo11');
  const [trainingMode, setTrainingMode] = useState('single_gpu');
  const [datasetId, setDatasetId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [modelDefId, setModelDefId] = useState('');
  const [epochs, setEpochs] = useState(50);
  const [batchSize, setBatchSize] = useState(16);
  const [learningRate, setLearningRate] = useState(0.01);
  const [optimizer, setOptimizer] = useState('AdamW');
  const [scheduler, setScheduler] = useState('cosine');
  const [augmentation, setAugmentation] = useState('medium');
  const [imageSize, setImageSize] = useState(640);
  const [mixedPrecision, setMixedPrecision] = useState(true);
  const [hpoEnabled, setHpoEnabled] = useState(false);
  const [hpoTrials, setHpoTrials] = useState(5);

  useEffect(() => {
    api.get<TrainingOptions>('/api/v1/training/options').then((o) => {
      setOptions(o);
      setEpochs(o.defaults.epochs as number);
      setBatchSize(o.defaults.batch_size as number);
      setLearningRate(o.defaults.learning_rate as number);
      setOptimizer(o.defaults.optimizer as string);
      setScheduler(o.defaults.scheduler as string);
      setImageSize(o.defaults.image_size as number);
      setHpoTrials(o.defaults.hpo_trials as number);
    }).catch(() => {});
    api.get<{ id: string; name: string; head_version_id?: string | null }[]>(`/api/v1/datasets/project/${projectId}`).then((ds) => {
      setDatasets(ds);
      if (ds.length) {
        setDatasetId(ds[0].id);
        if (ds[0].head_version_id) setVersionId(ds[0].head_version_id);
      }
    }).catch(() => {});
    api.get<{ id: string; name: string }[]>(`/api/v1/projects/${projectId}/models`).then(setModels).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!datasetId) { setVersions([]); setVersionId(''); return; }
    api.get<{ id: string; version_tag: string }[]>(`/api/v1/datasets/${datasetId}/versions`).then((v) => {
      setVersions(v);
      const ds = datasets.find((d) => d.id === datasetId);
      if (ds?.head_version_id) setVersionId(ds.head_version_id);
      else if (v.length) setVersionId(v[v.length - 1].id);
    }).catch(() => {});
  }, [datasetId, datasets]);

  const startTraining = async () => {
    setLoading(true);
    try {
      let vid = versionId;
      if (!vid && datasetId) {
        const ds = datasets.find((d) => d.id === datasetId);
        vid = ds?.head_version_id || '';
      }
      if (!vid) {
        const summary = await api.get<{ head_version_id: string }>(`/api/v1/datasets/${datasetId}/summary`).catch(() => null);
        vid = summary?.head_version_id || '';
      }
      await api.post(`/api/v1/training/project/${projectId}`, {
        name: name || `${architecture} Training`,
        architecture,
        training_mode: trainingMode,
        model_definition_id: modelDefId || null,
        dataset_version_id: vid || null,
        hpo_enabled: hpoEnabled,
        config: {
          epochs, batch_size: batchSize, learning_rate: learningRate,
          optimizer, scheduler, augmentation, image_size: imageSize,
          mixed_precision: mixedPrecision, hpo_trials: hpoTrials, patience: 10, val_split: 0.2,
        },
      });
      onStarted();
      setName('');
    } finally {
      setLoading(false);
    }
  };

  const selectCls = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          إعداد التدريب / Training Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <p className="text-sm text-muted-foreground">
            {advanced ? 'Advanced settings' : 'Simple mode — dataset & model only'}
          </p>
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? 'Switch to Simple' : 'Show Advanced'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {!advanced && (
            <div className="md:col-span-3">
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <select className={selectCls} value={datasetId} onChange={(e) => { setDatasetId(e.target.value); setVersionId(''); }}>
                <option value="">— Select dataset —</option>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {advanced && (
          <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Job Name</label>
            <Input placeholder="Accident Detection v2" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model Definition</label>
            <select className={selectCls} value={modelDefId} onChange={(e) => setModelDefId(e.target.value)}>
              <option value="">— Select —</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          </>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Architecture</label>
            <select className={selectCls} value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              {options?.architectures.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          {advanced && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Training Mode</label>
            <select className={selectCls} value={trainingMode} onChange={(e) => setTrainingMode(e.target.value)}>
              {options?.training_modes.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          )}
          {advanced && (
          <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
            <select className={selectCls} value={datasetId} onChange={(e) => { setDatasetId(e.target.value); setVersionId(''); }}>
              <option value="">— Select —</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dataset Version</label>
            <select className={selectCls} value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!datasetId}>
              <option value="">— Select —</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.version_tag} ({v.id.slice(0,8)}…)</option>)}
            </select>
          </div>
          </>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium mb-3">{advanced ? 'Hyperparameters' : 'Training settings'}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Epochs</label>
              <Input type="number" value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </div>
            {advanced && (
            <>
            <div>
              <label className="text-xs text-muted-foreground">Batch Size</label>
              <Input type="number" value={batchSize} onChange={(e) => setBatchSize(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Learning Rate</label>
              <Input type="number" step="0.001" value={learningRate} onChange={(e) => setLearningRate(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Image Size</label>
              <Input type="number" value={imageSize} onChange={(e) => setImageSize(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Optimizer</label>
              <select className={selectCls} value={optimizer} onChange={(e) => setOptimizer(e.target.value)}>
                {options?.optimizers.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Scheduler</label>
              <select className={selectCls} value={scheduler} onChange={(e) => setScheduler(e.target.value)}>
                {options?.schedulers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Augmentation</label>
              <select className={selectCls} value={augmentation} onChange={(e) => setAugmentation(e.target.value)}>
                {options?.augmentation_presets.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            </>
            )}
          </div>
        </div>

        {advanced && (
        <div className="flex flex-wrap items-center gap-6 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={mixedPrecision} onChange={(e) => setMixedPrecision(e.target.checked)} />
            Mixed Precision (AMP)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={hpoEnabled} onChange={(e) => setHpoEnabled(e.target.checked)} />
            Auto HPO (Optuna)
          </label>
          {hpoEnabled && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Trials:</label>
              <Input type="number" className="w-20" value={hpoTrials} onChange={(e) => setHpoTrials(+e.target.value)} />
            </div>
          )}
        </div>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={startTraining} disabled={loading || !datasetId}>
            <Play className="h-4 w-4 mr-2" />
            {loading ? 'Starting...' : 'Start Training'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
