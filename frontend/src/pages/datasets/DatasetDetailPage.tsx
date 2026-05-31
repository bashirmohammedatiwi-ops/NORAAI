import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DatasetGallery } from '@/components/datasets/DatasetGallery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Tag } from 'lucide-react';

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
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectId}/datasets`} className="hover:text-primary">All datasets</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{summary?.name ?? 'Loading...'}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Images</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.image_count}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1"><Tag className="h-3 w-3" /> Labeled</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.annotated_count}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Unlabeled</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.unlabeled_count}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1"><Layers className="h-3 w-3" /> Classes</CardTitle></CardHeader><CardContent>
            <div className="flex flex-wrap gap-1">
              {stats.per_class.filter((c) => c.image_count > 0).map((c) => (
                <Badge key={c.class_id} className="text-white border-0" style={{ backgroundColor: c.color }}>{c.name}</Badge>
              ))}
            </div>
          </CardContent></Card>
        </div>
      )}

      <DatasetGallery datasetId={datasetId} projectId={projectId} showHeader={false} />
    </div>
  );
}
