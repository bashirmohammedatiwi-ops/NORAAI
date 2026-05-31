import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Database, ExternalLink } from 'lucide-react';

interface DatasetSummary {
  id: string;
  name: string;
  head_version_id: string | null;
  image_count: number;
}

export default function DatasetsPage() {
  const { id: projectId } = useParams();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [images, setImages] = useState<{ id: string; filename: string; status: string }[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!projectId) return;
    api.get<DatasetSummary[]>(`/api/v1/datasets/project/${projectId}`).then(setDatasets).catch(() => {});
  }, [projectId]);

  const loadImages = async (datasetId: string) => {
    setSelected(datasetId);
    const imgs = await api.get<typeof images>(`/api/v1/datasets/${datasetId}/images`).catch(() => []);
    setImages(imgs);
  };

  const createDataset = async () => {
    if (!projectId || !newName.trim()) return;
    await api.post(`/api/v1/datasets/project/${projectId}`, { name: newName.trim() });
    setNewName('');
    const d = await api.get<typeof datasets>(`/api/v1/datasets/project/${projectId}`);
    setDatasets(d);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Datasets</h1>
        {projectId && (
          <Link to={`/projects/${projectId}/data`}>
            <Button><Database className="h-4 w-4 mr-2" /> Open Dataset Builder</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Create Dataset</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Dataset name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={createDataset}>Create</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Your Datasets</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {datasets.length === 0 && (
              <p className="text-sm text-muted-foreground">No datasets yet. Use Data Hub to upload images.</p>
            )}
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => loadImages(d.id)}
                className={`w-full text-left p-3 rounded border border-border hover:border-primary/50 ${selected === d.id ? 'bg-primary/5 border-primary/30' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-sm text-muted-foreground">{d.image_count} images</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Images in Dataset</CardTitle></CardHeader>
          <CardContent>
            {!selected && <p className="text-sm text-muted-foreground">Select a dataset to view images.</p>}
            {selected && images.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No images.{' '}
                <Link to={`/projects/${projectId}/data`} className="text-primary underline inline-flex items-center gap-1">
                  Upload in Data Hub <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            )}
            <div className="space-y-1 max-h-80 overflow-auto">
              {images.map((img) => (
                <div key={img.id} className="flex justify-between text-sm p-2 border-b border-border">
                  <span className="truncate">{img.filename}</span>
                  <span className="text-muted-foreground">{img.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
