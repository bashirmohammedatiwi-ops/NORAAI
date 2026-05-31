import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Play, Rocket } from 'lucide-react';

interface Props {
  projectId: string;
  datasetId: string;
  datasetVersionId: string;
  imageCount: number;
}

export function SimpleTrainingPanel({ projectId, datasetVersionId, imageCount }: Props) {
  const [architecture, setArchitecture] = useState('yolo11');
  const [epochs, setEpochs] = useState(20);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const startTraining = async () => {
    if (imageCount < 1) return;
    setLoading(true);
    setDone(false);
    try {
      await api.post(`/api/v1/training/project/${projectId}`, {
        name: `${architecture} training`,
        architecture,
        training_mode: 'single_gpu',
        dataset_version_id: datasetVersionId,
        hpo_enabled: false,
        config: {
          epochs,
          batch_size: 8,
          learning_rate: 0.01,
          optimizer: 'AdamW',
          scheduler: 'cosine',
          augmentation: 'medium',
          image_size: 640,
          mixed_precision: false,
          val_split: 0.2,
        },
      });
      setDone(true);
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
              <Rocket className="h-5 w-5 text-emerald-600" />
              Quick Train
            </CardTitle>
            <CardDescription>
              Train on <strong>{imageCount}</strong> labeled images (80% train / 20% validation)
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
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Epochs</label>
            <Input type="number" className="w-24" value={epochs} min={5} max={200} onChange={(e) => setEpochs(+e.target.value)} />
          </div>
          <Button onClick={startTraining} disabled={loading || imageCount < 1} variant="success">
            <Play className="h-4 w-4" />
            {loading ? 'Starting...' : 'Start Training'}
          </Button>
        </div>
        {done && (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
            Training started!{' '}
            <Link to={`/projects/${projectId}/training`} className="underline font-semibold">
              View progress →
            </Link>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Need full control?{' '}
          <Link to={`/projects/${projectId}/training`} className="underline text-primary">Advanced Training</Link>
        </p>
      </CardContent>
    </Card>
  );
}
