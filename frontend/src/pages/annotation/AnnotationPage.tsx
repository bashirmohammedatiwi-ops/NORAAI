import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import { ImageAnnotationOverlay } from '@/components/datasets/ImageAnnotationOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PendingAnn {
  id: string;
  image_id: string;
  class_id: string;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  confidence: number;
  status: string;
}

export default function AnnotationPage() {
  const { id } = useParams();
  const [pending, setPending] = useState<PendingAnn[]>([]);
  const [activeLearning, setActiveLearning] = useState<{ id: string; image_id: string; uncertainty_score: number; confidence: number }[]>([]);
  const [classNames, setClassNames] = useState<Record<string, { name: string; color: string }>>({});

  const load = () => {
    if (!id) return;
    api.get<PendingAnn[]>(`/api/v1/annotation/project/${id}/pending`).then(setPending).catch(() => {});
    api.get<typeof activeLearning>(`/api/v1/annotation/active-learning/${id}`).then(setActiveLearning).catch(() => {});
    api.get<{ id: string; name: string; color: string }[]>(`/api/v1/projects/${id}/classes`).then((list) => {
      const map: Record<string, { name: string; color: string }> = {};
      list.forEach((c) => { map[c.id] = { name: c.name, color: c.color }; });
      setClassNames(map);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const approve = async (annId: string) => {
    await api.post(`/api/v1/annotation/${annId}/approve`);
    load();
  };

  const reject = async (annId: string) => {
    await api.post(`/api/v1/annotation/${annId}/reject`);
    load();
  };

  const annToOverlay = (a: PendingAnn) => {
    const cls = classNames[a.class_id];
    return [{
      class_name: cls?.name ?? 'class',
      class_color: cls?.color ?? '#3B82F6',
      x_center: a.x_center,
      y_center: a.y_center,
      width: a.width,
      height: a.height,
      status: a.status,
    }];
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Annotation & Active Learning</h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Pending Review ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-h-[70vh] overflow-auto">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row gap-3 p-3 rounded border border-border">
                <div className="relative w-full sm:w-40 aspect-square shrink-0 rounded overflow-hidden bg-secondary">
                  <AuthenticatedImage imageId={a.image_id} className="w-full h-full object-cover" />
                  <ImageAnnotationOverlay annotations={annToOverlay(a)} />
                </div>
                <div className="flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {classNames[a.class_id]?.name ?? 'Unknown class'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Confidence: {((a.confidence ?? 0) * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(a.id)}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => reject(a.id)}>Reject</Button>
                  </div>
                </div>
              </div>
            ))}
            {pending.length === 0 && <p className="text-muted-foreground">No pending annotations</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Needs Review — Active Learning ({activeLearning.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-h-[70vh] overflow-auto">
            {activeLearning.map((q) => (
              <div key={q.id} className="flex gap-3 p-3 rounded border border-yellow-500/30 bg-yellow-500/5">
                <div className="relative w-24 aspect-square shrink-0 rounded overflow-hidden bg-secondary">
                  <AuthenticatedImage imageId={q.image_id} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-yellow-600">
                      Uncertainty: {(q.uncertainty_score * 100).toFixed(1)}% · Conf: {(q.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => api.post(`/api/v1/annotation/active-learning/${q.id}/resolve`).then(load)}>Resolve</Button>
                </div>
              </div>
            ))}
            {activeLearning.length === 0 && <p className="text-muted-foreground">No uncertain predictions</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
