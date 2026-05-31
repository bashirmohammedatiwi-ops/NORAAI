import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DatasetGallery } from '@/components/datasets/DatasetGallery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Database, Layers, Tag } from 'lucide-react';

interface DatasetSummary {
  id: string;
  name: string;
  description: string | null;
  head_version_id: string | null;
  version_tag: string | null;
  image_count: number;
}

interface BuilderStats {
  image_count: number;
  annotated_count: number;
  unlabeled_count: number;
  ready_for_training: boolean;
  per_class: { class_id: string; name: string; color: string; count: number; image_count: number }[];
}

export default function DatasetDetailPage() {
  const { id: projectId, datasetId } = useParams();
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [stats, setStats] = useState<BuilderStats | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    api.get<DatasetSummary>(`/api/v1/datasets/${datasetId}/summary`).then(setSummary).catch(() => {});
    api.get<BuilderStats>(`/api/v1/datasets/${datasetId}/builder-stats`).then(setStats).catch(() => {});
  }, [datasetId]);

  if (!datasetId || !projectId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/projects/${projectId}/datasets`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Datasets</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{summary?.name ?? 'Dataset'}</h1>
          {summary?.description && <p className="text-muted-foreground">{summary.description}</p>}
        </div>
        <Link to={`/projects/${projectId}/data`}>
          <Button><Database className="h-4 w-4 mr-2" /> Dataset Builder</Button>
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Images</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.image_count}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> Labeled</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.annotated_count}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unlabeled</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.unlabeled_count}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Layers className="h-3 w-3" /> Classes</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {stats.per_class.filter((c) => c.image_count > 0).map((c) => (
                  <span key={c.class_id} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: c.color }}>
                    {c.name}: {c.image_count}
                  </span>
                ))}
                {stats.per_class.every((c) => c.image_count === 0) && (
                  <span className="text-sm text-muted-foreground">None yet</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <DatasetGallery datasetId={datasetId} projectId={projectId} showHeader={false} />
    </div>
  );
}
