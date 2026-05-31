import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SimpleTrainingPanel } from '@/components/training/SimpleTrainingPanel';
import { Database, ImagePlus, Layers, RefreshCw, Tag, Upload } from 'lucide-react';

interface DatasetSummary {
  id: string;
  name: string;
  description?: string;
  head_version_id: string | null;
  version_tag: string | null;
  image_count: number;
}

interface DatasetImage {
  id: string;
  filename: string;
  status: string;
  quality_score: number | null;
}

export default function DataHubPage() {
  const { id: projectId } = useParams();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const loadDatasets = useCallback(async () => {
    if (!projectId) return;
    let list = await api.get<DatasetSummary[]>(`/api/v1/datasets/project/${projectId}`).catch(() => []);
    if (!list.length) {
      const created = await api.post<DatasetSummary>(`/api/v1/datasets/project/${projectId}/default`).catch(() => null);
      if (created) list = [created];
    }
    setDatasets(list);
    setSelectedId((prev) => prev || list[0]?.id || '');
  }, [projectId]);

  const loadDatasetDetails = useCallback(async () => {
    if (!selectedId) return;
    const [s, imgs] = await Promise.all([
      api.get<DatasetSummary>(`/api/v1/datasets/${selectedId}/summary`).catch(() => null),
      api.get<DatasetImage[]>(`/api/v1/datasets/${selectedId}/images`).catch(() => []),
    ]);
    setSummary(s);
    setImages(imgs);
  }, [selectedId]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);
  useEffect(() => { loadDatasetDetails(); }, [loadDatasetDetails]);

  const createDataset = async () => {
    if (!projectId || !newName.trim()) return;
    await api.post(`/api/v1/datasets/project/${projectId}`, { name: newName.trim() });
    setNewName('');
    await loadDatasets();
    setMessage(`Dataset "${newName}" created`);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !selectedId) return;
    setUploading(true);
    setMessage('');
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      form.append('source_type', 'manual_upload');
      const res = await api.post<{ message: string }>(`/api/v1/datasets/${selectedId}/upload`, form);
      setMessage(res.message || `Uploading ${files.length} image(s)...`);
      setTimeout(loadDatasetDetails, 3000);
      setTimeout(loadDatasetDetails, 8000);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            Data Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload images to a dataset, then train — all in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadDatasets(); loadDatasetDetails(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Link to={`/projects/${projectId}/classes`}>
            <Button variant="outline" size="sm"><Tag className="h-4 w-4 mr-1" /> Classes</Button>
          </Link>
          <Link to={`/projects/${projectId}/annotation`}>
            <Button variant="outline" size="sm"><Layers className="h-4 w-4 mr-1" /> Annotate</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">1. Choose Dataset</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.image_count} imgs)</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input placeholder="New dataset name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button size="sm" onClick={createDataset}>+</Button>
            </div>
            {summary && (
              <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t border-border">
                <p>Version: {summary.version_tag || '—'}</p>
                <p className="text-lg font-semibold text-foreground">{summary.image_count} images ready</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> 2. Upload to Dataset
          </CardTitle></CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-border rounded-lg p-10 text-center hover:border-primary/50 transition-colors"
            >
              <ImagePlus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">Drop images here or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">
                Images go directly into <strong>{summary?.name || 'selected dataset'}</strong>
              </p>
              <Input
                type="file"
                accept="image/*"
                multiple
                className="mt-4 max-w-xs mx-auto"
                disabled={!selectedId || uploading}
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </div>
            {message && <p className="text-sm text-primary mt-3">{message}</p>}
            {uploading && <p className="text-sm text-muted-foreground mt-2">Uploading...</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dataset Images ({images.length})</CardTitle></CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <p className="text-muted-foreground text-sm">No images yet. Upload photos above.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {images.slice(0, 24).map((img) => (
                <div key={img.id} className="rounded border border-border p-2 text-xs">
                  <div className="aspect-square bg-secondary/50 rounded mb-1 flex items-center justify-center text-muted-foreground">
                    IMG
                  </div>
                  <p className="truncate">{img.filename}</p>
                  <p className="text-muted-foreground">{img.status} · Q:{img.quality_score?.toFixed(0) ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
          {images.length > 24 && <p className="text-xs text-muted-foreground mt-2">+ {images.length - 24} more</p>}
        </CardContent>
      </Card>

      {projectId && selectedId && summary?.head_version_id && (
        <SimpleTrainingPanel
          projectId={projectId}
          datasetId={selectedId}
          datasetVersionId={summary.head_version_id}
          imageCount={summary.image_count}
        />
      )}

      {projectId && selectedId && !summary?.head_version_id && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground text-sm">
            Upload at least one image to enable training.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
