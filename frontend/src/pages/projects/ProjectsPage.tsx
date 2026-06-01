import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectsList, useInvalidateProjects } from '@/hooks/useProjects';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { Plus, ArrowRight, Trash2 } from 'lucide-react';

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjectsList();
  const { invalidateList } = useInvalidateProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/api/v1/projects', { name: name.trim(), description: '', domain: 'computer_vision' });
    setName('');
    setShowCreate(false);
    await invalidateList();
  };

  const deleteProject = async (password: string) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteWithBody(`/api/v1/projects/${deleteTarget.id}`, { password });
      setDeleteTarget(null);
      await invalidateList();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Projects">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New</Button>
      </PageHeader>

      {showCreate && (
        <div className="surface p-4 flex flex-wrap gap-2">
          <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button onClick={create}>Create</Button>
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <Card key={p.id} className="hover:border-primary/30 transition-colors">
            <CardContent className="p-4 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{p.name}</p>
                  <Badge variant={p.has_model ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
                    {p.has_model ? 'Model ready' : 'No model'}
                  </Badge>
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
              </div>
              <div className="flex gap-2">
                <Link to={`/projects/${p.id}`} className="flex-1">
                  <Button className="w-full" size="sm">Open <ArrowRight className="h-3.5 w-3.5" /></Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-red-50"
                  onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && projects.length === 0 && !showCreate && (
        <div className="surface py-12 text-center text-sm text-muted-foreground">
          <p>No projects yet</p>
          <Button className="mt-3" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New project</Button>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete project?"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" with all datasets, classes, images, models, training jobs, and deployments.`
            : ''
        }
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteProject}
      />
    </div>
  );
}
