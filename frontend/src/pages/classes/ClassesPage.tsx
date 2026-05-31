import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';

export default function ClassesPage() {
  const { id } = useParams();
  const [classes, setClasses] = useState<{ id: string; name: string; color: string; is_archived: boolean }[]>([]);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    if (!id) return;
    api.get<typeof classes>(`/api/v1/projects/${id}/classes`).then(setClasses).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const addClass = async () => {
    if (!newName.trim() || !id) return;
    await api.post(`/api/v1/projects/${id}/classes`, { name: newName.trim() });
    setNewName('');
    load();
  };

  const deleteClass = async (password: string) => {
    if (!id || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteWithBody(`/api/v1/projects/${id}/classes/${deleteTarget.id}`, { password });
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const visible = classes.filter((c) => !c.is_archived);

  return (
    <div className="space-y-6">
      <PageHeader title="Classes" description="Detection labels for your project. Deleting a class removes all its annotations." />

      <Card>
        <CardHeader><CardTitle>Add Class</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Class name (e.g. pothole)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={addClass}>Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classes ({visible.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visible.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="truncate font-medium">{c.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete class?"
        description={
          deleteTarget
            ? `Permanently delete class "${deleteTarget.name}" and all annotations using this label.`
            : ''
        }
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteClass}
      />
    </div>
  );
}
