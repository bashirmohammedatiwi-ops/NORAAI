import { useState } from 'react';
import { api } from '@/lib/api';
import { buildRetrainQuery, CPU_PRESETS, DEFAULT_CPU_PRESET, type CpuPreset } from '@/lib/trainingPresets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Loader2, Play, Settings2, Cpu, Zap } from 'lucide-react';

interface Props {
  projectId: string;
  datasetId: string;
  imageCount: number;
  ready: boolean;
  onStarted: (jobId?: string) => void;
  showAdvanced?: boolean;
  onToggleAdvanced?: () => void;
}

export function SimpleTrainCard({
  projectId,
  datasetId,
  imageCount,
  ready,
  onStarted,
  showAdvanced,
  onToggleAdvanced,
}: Props) {
  const [architecture, setArchitecture] = useState('yolo11');
  const [preset, setPreset] = useState<CpuPreset>(DEFAULT_CPU_PRESET);
  const [epochs, setEpochs] = useState(CPU_PRESETS[DEFAULT_CPU_PRESET].epochs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onPresetChange = (value: CpuPreset) => {
    setPreset(value);
    setEpochs(CPU_PRESETS[value].epochs);
  };

  const start = async () => {
    if (!ready || !datasetId) return;
    setLoading(true);
    setError('');
    try {
      const query = buildRetrainQuery({ epochs, architecture, preset });
      const job = await api.post<{ id: string }>(
        `/api/v1/training/project/${projectId}/retrain?${query}`,
        undefined,
        undefined,
        120_000,
      );
      onStarted(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start training');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 to-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-600" />
              Train Model
            </CardTitle>
            <CardDescription className="mt-1">
              {imageCount > 0
                ? `${imageCount} images ready · default: Best Accuracy preset`
                : 'Upload images first to enable training'}
            </CardDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Cpu className="h-3 w-3" /> CPU Training
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Zap className="h-3 w-3" /> {CPU_PRESETS[preset].label}
              </Badge>
            </div>
          </div>
          {onToggleAdvanced && (
            <Button type="button" variant="ghost" size="sm" onClick={onToggleAdvanced}>
              <Settings2 className="h-4 w-4" />
              {showAdvanced ? 'Simple' : 'Advanced'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[140px] flex-1">
            <Select label="CPU preset" value={preset} onChange={(e) => onPresetChange(e.target.value as CpuPreset)}>
              {(Object.entries(CPU_PRESETS) as [CpuPreset, typeof CPU_PRESETS.fast_cpu][]).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[140px] flex-1">
            <Select label="Model" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              <option value="yolo11">YOLO11 (recommended)</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
            <Input
              type="number"
              className="w-24"
              value={epochs}
              min={5}
              max={200}
              onChange={(e) => setEpochs(+e.target.value)}
            />
          </div>
          <Button
            onClick={start}
            disabled={loading || !ready}
            variant="success"
            className="min-w-[140px]"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</>
            ) : (
              <><Zap className="h-4 w-4" /> Fast Train</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{CPU_PRESETS[preset].description}</p>
        {error && (
          <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
