import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArchitectureBadge, TrainingStatusBadge } from '@/components/training/TrainingStatusBadge';
import { METRIC_DISPLAY } from '@/lib/trainingMetrics';
import { cn } from '@/lib/utils';
import { Box, Download, Trophy, Zap } from 'lucide-react';

interface ModelArtifact {
  id: string;
  name: string;
  architecture: string;
  lifecycle: string;
  metrics: Record<string, number>;
  model_size_mb: number;
  classes_used: string[];
  training_duration_seconds: number | null;
  gpu_used: string | null;
  created_at: string;
}

const LIFECYCLE_OPTIONS = ['registered', 'staging', 'production', 'archived'];

export default function ModelsPage() {
  const { id } = useParams();
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelArtifact | null>(null);
  const [comparison, setComparison] = useState<{ models: Record<string, unknown>[]; winner: { model_id: string; score: number } | null } | null>(null);

  const load = () => {
    if (!id) return;
    api.get<ModelArtifact[]>(`/api/v1/models/project/${id}`).then(setModels).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const toggleSelect = (modelId: string) => {
    setSelected((prev) => prev.includes(modelId) ? prev.filter((x) => x !== modelId) : [...prev, modelId].slice(-2));
  };

  const compare = async () => {
    if (selected.length < 2) return;
    const result = await api.post<typeof comparison>('/api/v1/models/compare', { model_ids: selected });
    setComparison(result);
  };

  const updateLifecycle = async (modelId: string, lifecycle: string) => {
    await api.patch(`/api/v1/models/${modelId}/lifecycle?lifecycle=${lifecycle}`);
    load();
    if (selectedModel?.id === modelId) {
      setSelectedModel((m) => m ? { ...m, lifecycle } : null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Model Registry</h1>
          <p className="text-muted-foreground">سجل النماذج — إدارة ومقارنة ونشر</p>
        </div>
        <Button onClick={compare} disabled={selected.length < 2}>
          Compare ({selected.length})
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Models', value: models.length },
          { label: 'Production', value: models.filter((m) => m.lifecycle === 'production').length },
          { label: 'Staging', value: models.filter((m) => m.lifecycle === 'staging').length },
          { label: `Best ${METRIC_DISPLAY.accuracy.label}`, value: models.length ? `${(Math.max(...models.map((m) => m.metrics?.map50_95 || 0)) * 100).toFixed(1)}%` : '—' },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          {models.map((m) => (
            <Card
              key={m.id}
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50',
                selected.includes(m.id) && 'border-primary ring-1 ring-primary',
                selectedModel?.id === m.id && 'bg-primary/5'
              )}
              onClick={() => setSelectedModel(m)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(m.id); }}
                    className="mt-1"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <ArchitectureBadge architecture={m.architecture} />
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    m.lifecycle === 'production' ? 'bg-green-500/20 text-green-400' :
                    m.lifecycle === 'staging' ? 'bg-blue-500/20 text-blue-400' : 'bg-secondary text-muted-foreground'
                  )}>{m.lifecycle}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span>{METRIC_DISPLAY.detectionAccuracy.label}: <strong>{m.metrics?.map50?.toFixed(3) || 'N/A'}</strong></span>
                  <span>{METRIC_DISPLAY.accuracy.label}: <strong>{m.metrics?.map50_95?.toFixed(3) || 'N/A'}</strong></span>
                  <span>Size: <strong>{m.model_size_mb?.toFixed(1)} MB</strong></span>
                  <span>GPU: <strong>{m.gpu_used || 'CPU'}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
          {models.length === 0 && (
            <div className="col-span-2 p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
              No models yet. Complete a training job to register artifacts.
            </div>
          )}
        </div>

        {selectedModel && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Model Details</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Name</p>
                <p className="font-medium">{selectedModel.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Lifecycle</p>
                <select
                  className="w-full h-9 rounded border border-border bg-background px-2"
                  value={selectedModel.lifecycle}
                  onChange={(e) => updateLifecycle(selectedModel.id, e.target.value)}
                >
                  {LIFECYCLE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Classes ({selectedModel.classes_used?.length || 0})</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedModel.classes_used || []).slice(0, 8).map((c) => (
                    <span key={c} className="text-xs bg-secondary px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-xs text-muted-foreground">Precision</p>
                  <p className="font-bold">{selectedModel.metrics?.precision ? `${(selectedModel.metrics.precision * 100).toFixed(1)}%` : '—'}</p>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-xs text-muted-foreground">Recall</p>
                  <p className="font-bold">{selectedModel.metrics?.recall ? `${(selectedModel.metrics.recall * 100).toFixed(1)}%` : '—'}</p>
                </div>
              </div>
              {selectedModel.training_duration_seconds && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  Training: {Math.floor(selectedModel.training_duration_seconds / 60)}m {selectedModel.training_duration_seconds % 60}s
                </div>
              )}
              <p className="text-xs text-muted-foreground">Created: {new Date(selectedModel.created_at).toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {comparison?.winner && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Comparison Winner — Score: {comparison.winner.score.toFixed(3)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comparison.models.map((m: Record<string, unknown>) => (
                <div key={m.id as string} className={cn(
                  'p-4 rounded border',
                  (m.id as string) === comparison.winner?.model_id ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-border'
                )}>
                  <p className="font-medium flex items-center gap-2">
                    {m.name as string}
                    {(m.id as string) === comparison.winner?.model_id && <Trophy className="h-4 w-4 text-yellow-500" />}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    {Object.entries(m.evaluation as Record<string, number>).map(([k, v]) => (
                      v != null && <div key={k}><span className="text-muted-foreground">{k}: </span><strong>{typeof v === 'number' ? v.toFixed(3) : v}</strong></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
