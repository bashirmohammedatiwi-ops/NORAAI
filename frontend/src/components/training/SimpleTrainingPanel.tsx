import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CPU_PRESETS, DEFAULT_CPU_PRESET, type CpuPreset } from '@/lib/trainingPresets';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Play, RefreshCw } from 'lucide-react';

interface Props {
  projectId: string;
  imageCount: number;
}

export function SimpleTrainingPanel({ projectId, imageCount }: Props) {
  const [architecture, setArchitecture] = useState('yolo11');
  const [preset, setPreset] = useState<CpuPreset>(DEFAULT_CPU_PRESET);
  const [epochs, setEpochs] = useState(CPU_PRESETS[DEFAULT_CPU_PRESET].epochs);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const startTraining = async () => {
    if (imageCount < 1) return;
    setLoading(true);
    setDone(false);
    try {
      await api.post(
        `/api/v1/training/project/${projectId}/retrain?epochs=${epochs}&architecture=${architecture}&preset=${preset}`
      );
      setDone(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to start training');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="step-badge">4</span>
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
              Retrain project model
            </CardTitle>
            <CardDescription>
              Updates the <strong>single project model</strong> with {imageCount} images — Road Intel, Fleet & Monitoring use it automatically
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[160px]">
            <Select label="Model" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              <option value="yolo11">YOLO11 (recommended)</option>
              <option value="yolov10">YOLOv10</option>
              <option value="rt_detr">RT-DETR</option>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select
              label="Speed preset"
              value={preset}
              onChange={(e) => {
                const p = e.target.value as CpuPreset;
                setPreset(p);
                setEpochs(CPU_PRESETS[p].epochs);
              }}
            >
              {(Object.keys(CPU_PRESETS) as CpuPreset[]).map((key) => (
                <option key={key} value={key}>{CPU_PRESETS[key].label}</option>
              ))}
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">{CPU_PRESETS[preset].description}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
            <Input type="number" className="w-24" value={epochs} min={5} max={200} onChange={(e) => setEpochs(+e.target.value)} />
          </div>
          <Button onClick={startTraining} disabled={loading || imageCount < 1} variant="success">
            <Play className="h-4 w-4" />
            {loading ? 'Starting...' : 'Retrain Model'}
          </Button>
        </div>
        {done && (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
            Retraining started!{' '}
            <Link to={`/projects/${projectId}/model`} className="underline font-semibold">View model →</Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
