import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function DatasetsPage() {
  const { id } = useParams();
  const [datasets, setDatasets] = useState<{ id: string; name: string; head_version_id: string | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<{ id: string; version_tag: string; image_count: number }[]>([]);
  const [diff, setDiff] = useState<{ added_images: string[]; removed_images: string[] } | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<typeof datasets>(`/api/v1/datasets/project/${id}`).then(setDatasets).catch(() => {});
  }, [id]);

  const loadVersions = async (datasetId: string) => {
    setSelected(datasetId);
    const v = await api.get<typeof versions>(`/api/v1/datasets/${datasetId}/versions`);
    setVersions(v);
  };

  const createDataset = async () => {
    await api.post(`/api/v1/datasets/project/${id}`, { name: newName });
    setNewName('');
    const d = await api.get<typeof datasets>(`/api/v1/datasets/project/${id}`);
    setDatasets(d);
  };

  const createVersion = async (datasetId: string, tag: string) => {
    await api.post(`/api/v1/datasets/${datasetId}/versions`, { version_tag: tag, image_ids: [] });
    loadVersions(datasetId);
  };

  const compareVersions = async (fromId: string, toId: string) => {
    const d = await api.get<typeof diff>(`/api/v1/datasets/versions/compare?from_version_id=${fromId}&to_version_id=${toId}`);
    setDiff(d);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Smart Dataset Manager</h1>

      <Card>
        <CardHeader><CardTitle>Create Dataset</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Dataset name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={createDataset}>Create</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Datasets</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {datasets.map((d) => (
              <div key={d.id} className="p-3 rounded border border-border">
                <div className="flex justify-between items-center">
                  <button onClick={() => loadVersions(d.id)} className="font-medium hover:text-primary">{d.name}</button>
                  <Button size="sm" variant="outline" onClick={() => createVersion(d.id, `v${versions.length + 1}`)}>New Version</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Version Timeline</CardTitle></CardHeader>
          <CardContent>
            {versions.map((v, i) => (
              <div key={v.id} className="flex justify-between p-2 border-b border-border">
                <span>{v.version_tag}</span>
                <span className="text-sm text-muted-foreground">{v.image_count} images</span>
                {i > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => compareVersions(versions[i-1].id, v.id)}>Compare</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {diff && (
        <Card>
          <CardHeader><CardTitle>Version Diff</CardTitle></CardHeader>
          <CardContent>
            <p>Added: {diff.added_images.length} | Removed: {diff.removed_images.length}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
