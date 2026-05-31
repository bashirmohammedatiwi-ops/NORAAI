import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ArrowRight, FolderKanban, Sparkles } from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<{ id: string; name: string; description: string; domain: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const load = () => api.get<typeof projects>('/api/v1/projects').then(setProjects).catch(() => {});

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/api/v1/projects', { name: name.trim(), description: '', domain: 'computer_vision' });
    setName('');
    setShowCreate(false);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Each project holds datasets, classes, training jobs, and deployed models."
      >
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Project</Button>
      </PageHeader>

      {showCreate && (
        <Card className="border-primary/30 shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Create new project</CardTitle>
            <CardDescription>Give your road detection or classification project a name</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input placeholder="e.g. Pothole Detection UAE" value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
            <Button onClick={create}>Create</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Card key={p.id} className="group hover:shadow-card hover:border-primary/30 transition-all">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <Badge variant="secondary">{p.domain.replace('_', ' ')}</Badge>
              </div>
              <CardTitle className="pt-2">{p.name}</CardTitle>
              <CardDescription>{p.description || 'No description yet'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link to={`/projects/${p.id}/data`}>
                <Button className="w-full justify-between" variant="default">
                  <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Dataset Builder</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to={`/projects/${p.id}`}>
                <Button className="w-full" variant="outline">Project overview</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {projects.length === 0 && !showCreate && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground mb-4">Create your first project to start uploading and training.</p>
            <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Project</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
