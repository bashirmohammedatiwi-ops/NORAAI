import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AnnotationPage() {
  const { id } = useParams();
  const [pending, setPending] = useState<{ id: string; image_id: string; confidence: number; status: string }[]>([]);
  const [activeLearning, setActiveLearning] = useState<{ id: string; image_id: string; uncertainty_score: number; confidence: number }[]>([]);

  const load = () => {
    if (!id) return;
    api.get<typeof pending>(`/api/v1/annotation/project/${id}/pending`).then(setPending).catch(() => {});
    api.get<typeof activeLearning>(`/api/v1/annotation/active-learning/${id}`).then(setActiveLearning).catch(() => {});
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

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Annotation & Active Learning</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Pending Review ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-auto">
            {pending.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded border border-border">
                <div>
                  <p className="text-sm">Image: {a.image_id.slice(0, 8)}...</p>
                  <p className="text-xs text-muted-foreground">Confidence: {(a.confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve(a.id)}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => reject(a.id)}>Reject</Button>
                </div>
              </div>
            ))}
            {pending.length === 0 && <p className="text-muted-foreground">No pending annotations</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Needs Review — Active Learning ({activeLearning.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-auto">
            {activeLearning.map((q) => (
              <div key={q.id} className="flex items-center justify-between p-3 rounded border border-yellow-500/30 bg-yellow-500/5">
                <div>
                  <p className="text-sm">Image: {q.image_id.slice(0, 8)}...</p>
                  <p className="text-xs text-yellow-400">Uncertainty: {(q.uncertainty_score * 100).toFixed(1)}% | Conf: {(q.confidence * 100).toFixed(1)}%</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => api.post(`/api/v1/annotation/active-learning/${q.id}/resolve`).then(load)}>Resolve</Button>
              </div>
            ))}
            {activeLearning.length === 0 && <p className="text-muted-foreground">No uncertain predictions</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
