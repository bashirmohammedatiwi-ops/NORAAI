import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SimpleTrainingPanel } from '@/components/training/SimpleTrainingPanel';
import {
  CheckCircle2, Database, ImagePlus, Plus, RefreshCw, Tag, Upload, AlertCircle,
} from 'lucide-react';

interface DatasetSummary {
  id: string;
  name: string;
  head_version_id: string | null;
  version_tag: string | null;
  image_count: number;
}

interface ProjectClass {
  id: string;
  name: string;
  color: string;
}

interface BuilderStats {
  dataset_id: string;
  dataset_name: string;
  head_version_id: string | null;
  image_count: number;
  annotated_count: number;
  ready_for_training: boolean;
  per_class: { class_id: string; name: string; color: string; count: number }[];
}

export default function DataHubPage() {
  const { id: projectId } = useParams();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [classes, setClasses] = useState<ProjectClass[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [stats, setStats] = useState<BuilderStats | null>(null);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const loadClasses = useCallback(async () => {
    if (!projectId) return;
    const list = await api.get<ProjectClass[]>(`/api/v1/projects/${projectId}/classes`).catch(() => []);
    setClasses(list);
    setSelectedClassId((prev) => prev || list[0]?.id || '');
  }, [projectId]);

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

  const loadStats = useCallback(async () => {
    if (!selectedId) return;
    const s = await api.get<BuilderStats>(`/api/v1/datasets/${selectedId}/builder-stats`).catch(() => null);
    setStats(s);
  }, [selectedId]);

  useEffect(() => { loadClasses(); loadDatasets(); }, [loadClasses, loadDatasets]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = () => {
    loadClasses();
    loadDatasets();
    loadStats();
  };

  const createDataset = async () => {
    if (!projectId || !newDatasetName.trim()) return;
    const name = newDatasetName.trim();
    await api.post(`/api/v1/datasets/project/${projectId}`, { name });
    setNewDatasetName('');
    await loadDatasets();
    setMessage(`Dataset "${name}" created`);
  };

  const addClass = async () => {
    if (!projectId || !newClassName.trim()) return;
    const name = newClassName.trim();
    const cls = await api.post<ProjectClass>(`/api/v1/projects/${projectId}/classes`, { name });
    setNewClassName('');
    await loadClasses();
    setSelectedClassId(cls.id);
    setMessage(`Class "${name}" added`);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !selectedId) return;
    if (!selectedClassId) {
      setMessage('Select a class before uploading (required for auto-labeling).');
      return;
    }
    setUploading(true);
    setMessage('');
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      form.append('source_type', 'manual_upload');
      form.append('class_id', selectedClassId);
      const res = await api.post<{ message: string }>(`/api/v1/datasets/${selectedId}/upload`, form);
      setMessage(res.message || `Uploading ${files.length} image(s)...`);
      setTimeout(loadStats, 3000);
      setTimeout(loadStats, 8000);
      setTimeout(loadStats, 15000);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            Dataset Builder
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload images with a class — auto full-image labels — then train.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Step 1: Dataset */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Dataset</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground block mb-1">Select dataset</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.image_count} imgs)</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-1 min-w-[200px]">
            <Input placeholder="New dataset name" value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} />
            <Button onClick={createDataset}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Classes */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" /> 2. Class (label for upload)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {classes.length === 0 && (
              <p className="text-sm text-muted-foreground">No classes yet — add one below.</p>
            )}
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClassId(c.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  selectedClassId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                }`}
              >
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 max-w-md">
            <Input placeholder="New class name (e.g. pothole)" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
            <Button variant="secondary" onClick={addClass}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Upload with class */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> 3. Upload images for class
            {selectedClass && (
              <span className="text-sm font-normal text-muted-foreground">
                → <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedClass.color }} />{selectedClass.name}</span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
              selectedClassId ? 'border-border hover:border-primary/50' : 'border-yellow-500/40 bg-yellow-500/5'
            }`}
          >
            <ImagePlus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {selectedClassId ? 'Drop images here or click to browse' : 'Select a class first'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Each image gets an auto full-image bounding box + class label for YOLO training
            </p>
            <Input
              type="file"
              accept="image/*"
              multiple
              className="mt-4 max-w-xs mx-auto"
              disabled={!selectedId || !selectedClassId || uploading}
              onChange={(e) => uploadFiles(e.target.files)}
            />
          </div>
          {message && <p className="text-sm text-primary mt-3">{message}</p>}
          {uploading && <p className="text-sm text-muted-foreground mt-2">Uploading...</p>}
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-base">Dataset Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total images</p>
                <p className="text-2xl font-bold">{stats.image_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Auto-labeled</p>
                <p className="text-2xl font-bold">{stats.annotated_count}</p>
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                {stats.ready_for_training ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <span className="text-green-600 font-medium">Ready for training</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <span className="text-yellow-600">Upload images with a class to enable training</span>
                  </>
                )}
              </div>
            </div>
            {stats.per_class.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                {stats.per_class.map((c) => (
                  <div key={c.class_id} className="flex items-center gap-2 text-sm px-3 py-1 rounded-full bg-secondary">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}: <strong>{c.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Train */}
      {projectId && stats?.ready_for_training && stats.head_version_id && (
        <SimpleTrainingPanel
          projectId={projectId}
          datasetId={selectedId}
          datasetVersionId={stats.head_version_id}
          imageCount={stats.image_count}
        />
      )}

      <p className="text-xs text-muted-foreground text-center">
        Need precise boxes? Use <Link to={`/projects/${projectId}/annotation`} className="underline text-primary">Annotation</Link> to refine labels.
      </p>
    </div>
  );
}
