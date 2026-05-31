import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<{ id: string; name: string; description: string; domain: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const load = () => api.get<typeof projects>('/api/v1/projects').then(setProjects).catch(() => {});

  useEffect(() => { load(); }, []);

  const create = async () => {
    await api.post('/api/v1/projects', { name, description: '', domain: 'computer_vision' });
    setName('');
    setShowCreate(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Projects</h1>
          <p className="text-muted-foreground">Manage ML projects, models, and deployments</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Project</Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6 flex gap-2">
            <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={create}>Create</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}/data`}>
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-lg">{p.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.description || 'No description'}</p>
                <span className="inline-block mt-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded">Dataset Builder →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
