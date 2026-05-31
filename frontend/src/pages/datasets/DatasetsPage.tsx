import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Database, Eye, ImageIcon, Tag } from 'lucide-react';

interface DatasetSummary {
  id: string;
  name: string;
  description: string | null;
  head_version_id: string | null;
  version_tag: string | null;
  image_count: number;
}

interface BuilderStats {
  annotated_count: number;
  unlabeled_count: number;
  ready_for_training: boolean;
  per_class: { class_id: string; name: string; color: string; image_count: number }[];
}

export default function DatasetsPage() {
  const { id: projectId } = useParams();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, BuilderStats>>({});
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!projectId) return;
    api.get<DatasetSummary[]>(`/api/v1/datasets/project/${projectId}`).then(async (list) => {
      setDatasets(list);
      const stats: Record<string, BuilderStats> = {};
      await Promise.all(
        list.map(async (d) => {
          const s = await api.get<BuilderStats>(`/api/v1/datasets/${d.id}/builder-stats`).catch(() => null);
          if (s) stats[d.id] = s;
        })
      );
      setStatsMap(stats);
    }).catch(() => {});
  }, [projectId]);

  const createDataset = async () => {
    if (!projectId || !newName.trim()) return;
    await api.post(`/api/v1/datasets/project/${projectId}`, { name: newName.trim() });
    setNewName('');
    const d = await api.get<DatasetSummary[]>(`/api/v1/datasets/project/${projectId}`);
    setDatasets(d);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Datasets</h1>
          <p className="text-muted-foreground">Browse images, classes, and labels per dataset</p>
        </div>
        {projectId && (
          <Link to={`/projects/${projectId}/data`}>
            <Button><Database className="h-4 w-4 mr-2" /> Dataset Builder</Button>
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

      {datasets.length === 0 && (
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
          const stats = statsMap[d.id];
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
                      <p className="font-bold">{stats.unlabeled_count}</p>
                    </div>
                    <div className="rounded bg-secondary/50 p-2">
                      <p className="text-xs text-muted-foreground">Classes</p>
                      <p className="font-bold">{stats.per_class.filter((c) => c.image_count > 0).length}</p>
                    </div>
                  </div>
                )}

                {stats && stats.per_class.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Tag className="h-3 w-3 text-muted-foreground mt-1" />
                    {stats.per_class.filter((c) => c.image_count > 0).map((c) => (
                      <span
                        key={c.class_id}
                        className="text-xs px-2 py-0.5 rounded-full text-white inline-flex items-center gap-1"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.name} ({c.image_count})
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
