import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ClassesPage() {
  const { id } = useParams();
  const [classes, setClasses] = useState<{ id: string; name: string; color: string; is_archived: boolean }[]>([]);
  const [newName, setNewName] = useState('');

  const load = () => {
    if (!id) return;
    api.get<typeof classes>(`/api/v1/projects/${id}/classes`).then(setClasses).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const addClass = async () => {
    await api.post(`/api/v1/projects/${id}/classes`, { name: newName });
    setNewName('');
    load();
  };

  const archive = async (classId: string) => {
    await api.delete(`/api/v1/projects/${id}/classes/${classId}`);
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Class Management</h1>

      <Card>
        <CardHeader><CardTitle>Add Class</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Class name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={addClass}>Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classes ({classes.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {classes.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded border border-border">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                  <span>{c.name}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => archive(c.id)}>Archive</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
