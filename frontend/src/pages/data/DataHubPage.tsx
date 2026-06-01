import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  useDatasetBuilderStats,
  useDatasetHub,
  useInvalidateDatasets,
  useProjectClasses,
} from '@/hooks/useDatasets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SimpleTrainingPanel } from '@/components/training/SimpleTrainingPanel';
import { BulkImageUpload } from '@/components/training/BulkImageUpload';
import { DatasetGallery } from '@/components/datasets/DatasetGallery';
import { DatasetLoadError } from '@/components/datasets/DatasetLoadError';
import {
  CheckCircle2, Eye, Plus, RefreshCw, AlertCircle,
} from 'lucide-react';

export default function DataHubPage() {
  const { id: projectId } = useParams();
  const { invalidateProject, invalidateDataset } = useInvalidateDatasets();
  const {
    data: hub,
    isLoading: hubLoading,
    isError: hubError,
    error: hubErr,
    isFetching: hubFetching,
    refetch: refetchHub,
  } = useDatasetHub(projectId);
  const {
    data: classes = [],
    refetch: refetchClasses,
  } = useProjectClasses(projectId);

  const datasets = hub?.datasets ?? [];
  const [selectedId, setSelectedId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!selectedId && hub?.default_dataset_id) {
      setSelectedId(hub.default_dataset_id);
    } else if (!selectedId && datasets[0]?.id) {
      setSelectedId(datasets[0].id);
    }
  }, [hub?.default_dataset_id, datasets, selectedId]);

  useEffect(() => {
    if (!selectedClassId && classes[0]?.id) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const {
    data: liveStats,
    refetch: refetchStats,
  } = useDatasetBuilderStats(selectedId || undefined);

  const stats = liveStats ?? (selectedId === hub?.default_dataset_id ? hub?.default_stats : null);

  const refreshAll = () => {
    refetchHub();
    refetchClasses();
    if (selectedId) refetchStats();
  };

  const createDataset = async () => {
    if (!projectId || !newDatasetName.trim()) return;
    const name = newDatasetName.trim();
    await api.post(`/api/v1/datasets/project/${projectId}`, { name });
    setNewDatasetName('');
    invalidateProject(projectId);
    await refetchHub();
    setMessage(`Dataset "${name}" created`);
  };

  const addClass = async () => {
    if (!projectId || !newClassName.trim()) return;
    const name = newClassName.trim();
    const cls = await api.post<{ id: string }>(`/api/v1/projects/${projectId}/classes`, { name });
    setNewClassName('');
    await refetchClasses();
    setSelectedClassId(cls.id);
    setMessage(`Class "${name}" added`);
  };

  const uploadComplete = () => {
    if (!projectId || !selectedId) return;
    setMessage('Upload complete — processing images in background');
    invalidateDataset(selectedId, projectId);
    window.setTimeout(() => refetchStats(), 2000);
    window.setTimeout(() => { refetchHub(); refetchStats(); }, 8000);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const showInitialLoading = hubLoading && !hub && datasets.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-sm text-foreground">
          <strong>Workflow:</strong> Pick dataset → choose class → upload images → train
        </p>
        <div className="flex gap-2">
          {selectedId && projectId && stats && stats.image_count > 0 && (
            <Link to={`/projects/${projectId}/datasets/${selectedId}`}>
              <Button variant="outline" size="sm"><Eye className="h-4 w-4" /> Gallery</Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={hubFetching}>
            <RefreshCw className={`h-4 w-4 ${hubFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {hubError && (
        <DatasetLoadError
          message={hubErr?.message}
          onRetry={() => refetchHub()}
          retrying={hubFetching}
        />
      )}

      {showInitialLoading && (
        <p className="text-sm text-muted-foreground text-center py-8">Loading datasets...</p>
      )}

      {!hubError && !showInitialLoading && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="step-badge">1</span>
                <div>
                  <CardTitle>Choose dataset</CardTitle>
                  <CardDescription>Select existing or create a new dataset</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[220px]">
                <Select label="Active dataset" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.image_count} images)</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2 flex-1 min-w-[220px]">
                <Input placeholder="New dataset name" value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} />
                <Button onClick={createDataset}><Plus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="step-badge">2</span>
                <div>
                  <CardTitle>Pick class label</CardTitle>
                  <CardDescription>Every uploaded image gets this class automatically</CardDescription>
                </div>
              </div>
            </CardHeader>
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                      selectedClassId === c.id ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border bg-card hover:bg-accent'
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="step-badge">3</span>
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    Upload images
                    {selectedClass && (
                      <Badge style={{ backgroundColor: selectedClass.color, color: '#fff', borderColor: 'transparent' }}>
                        {selectedClass.name}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Drag & drop or browse — auto full-image YOLO labels</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <BulkImageUpload
                datasetId={selectedId}
                classId={selectedClassId}
                className={selectedClass?.name}
                classColor={selectedClass?.color}
                disabled={!selectedId}
                onComplete={uploadComplete}
              />
              {message && <p className="text-sm text-primary mt-3">{message}</p>}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <p className="text-xs text-muted-foreground">Total images</p>
                    <p className="text-2xl font-bold">{stats.image_count}</p>
                  </div>
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <p className="text-xs text-muted-foreground">Auto-labeled</p>
                    <p className="text-2xl font-bold">{stats.annotated_count}</p>
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 rounded-xl border border-border/60 p-4">
                    {stats.ready_for_training ? (
                      <>
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        <span className="text-emerald-700 font-medium">Ready for training</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-6 w-6 text-amber-500" />
                        <span className="text-amber-700">Upload images with a class to enable training</span>
                      </>
                    )}
                  </div>
                </div>
                {stats.per_class.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {stats.per_class.map((c) => (
                      <Badge key={c.class_id} variant="outline" className="gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}: {c.count ?? c.image_count ?? 0}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {projectId && stats?.ready_for_training && stats.head_version_id && (
            <SimpleTrainingPanel projectId={projectId} imageCount={stats.image_count} />
          )}

          {selectedId && stats && stats.image_count > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Uploaded images preview</CardTitle>
                <Link to={`/projects/${projectId}/datasets/${selectedId}`}>
                  <Button variant="ghost" size="sm" className="text-primary">View full gallery</Button>
                </Link>
              </CardHeader>
              <CardContent>
                <DatasetGallery datasetId={selectedId} projectId={projectId} pageSize={12} showHeader={false} />
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Need precise boxes? Use <Link to={`/projects/${projectId}/annotation`} className="underline text-primary">Annotation</Link> to refine labels.
          </p>
        </>
      )}
    </div>
  );
}
