import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useInvalidateDatasets, useProjectDatasets } from '@/hooks/useDatasets';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { DatasetLoadError } from '@/components/datasets/DatasetLoadError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Database, Eye, ImageIcon, Tag, Trash2, RefreshCw } from 'lucide-react';

export default function DatasetsPage() {
  const { id: projectId } = useParams();
  const { invalidateProject } = useInvalidateDatasets();
  const {
    data: datasets = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useProjectDatasets(projectId, { includeStats: true });

  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const createDataset = async () => {
    if (!projectId || !newName.trim()) return;
    await api.post(`/api/v1/datasets/project/${projectId}`, { name: newName.trim() });
    setNewName('');
    invalidateProject(projectId);
    await refetch();
  };

  const deleteDataset = async (password: string) => {
    if (!deleteTarget || !projectId) return;
    setDeleting(true);
    try {
      await api.deleteWithBody(`/api/v1/datasets/${deleteTarget.id}`, { password });
      setDeleteTarget(null);
      invalidateProject(projectId);
      await refetch();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dataset Gallery"
        description="Browse all datasets — view images, class labels, and annotation status."
      >
        {projectId && (
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Link to={`/projects/${projectId}/data`}>
              <Button><Database className="h-4 w-4" /> Dataset Builder</Button>
            </Link>
          </>
        )}
      </PageHeader>

      <Card>
        <CardHeader><CardTitle>Create Dataset</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Dataset name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={createDataset}>Create</Button>
        </CardContent>
      </Card>

      {isError && (
        <DatasetLoadError message={error?.message} onRetry={() => refetch()} retrying={isFetching} />
      )}

      {isLoading && !datasets.length && !isError && (
        <p className="text-sm text-muted-foreground text-center py-8">Loading datasets...</p>
      )}

      {!isError && !isLoading && datasets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No datasets yet.</p>
            <Link to={`/projects/${projectId}/data`} className="text-primary underline text-sm mt-2 inline-block">
              Open Dataset Builder to upload images
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {datasets.map((d) => {
          const stats = d.builder_stats;
          return (
            <Card key={d.id} className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{d.name}</span>
                  <span className="text-sm font-normal text-muted-foreground shrink-0">
                    {d.image_count} img
                  </span>
                </CardTitle>
                {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                {stats && (
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded bg-secondary/50 p-2">
                      <p className="text-xs text-muted-foreground">Labeled</p>
                      <p className="font-bold">{stats.annotated_count}</p>
                    </div>
                    <div className="rounded bg-secondary/50 p-2">
                      <p className="text-xs text-muted-foreground">Unlabeled</p>
                      <p className="font-bold">{stats.unlabeled_count ?? 0}</p>
                    </div>
                    <div className="rounded bg-secondary/50 p-2">
                      <p className="text-xs text-muted-foreground">Classes</p>
                      <p className="font-bold">{stats.per_class.filter((c) => (c.image_count ?? c.count ?? 0) > 0).length}</p>
                    </div>
                  </div>
                )}

                {stats && stats.per_class.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Tag className="h-3 w-3 text-muted-foreground mt-1" />
                    {stats.per_class.filter((c) => (c.image_count ?? c.count ?? 0) > 0).map((c) => (
                      <span
                        key={c.class_id}
                        className="text-xs px-2 py-0.5 rounded-full text-white inline-flex items-center gap-1"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.name} ({c.image_count ?? c.count ?? 0})
                      </span>
                    ))}
                  </div>
                )}

                {stats?.ready_for_training && (
                  <p className="text-xs text-green-600">Ready for training</p>
                )}

                <Link to={`/projects/${projectId}/datasets/${d.id}`}>
                  <Button className="w-full" variant="outline">
                    <Eye className="h-4 w-4 mr-2" /> Browse images & labels
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-red-50"
                  onClick={() => setDeleteTarget({ id: d.id, name: d.name })}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete dataset
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete dataset?"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" with all versions, images, and labels in this dataset.`
            : ''
        }
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteDataset}
      />
    </div>
  );
}
