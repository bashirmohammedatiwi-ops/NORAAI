import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

export default function IngestionPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects').then(setProjects).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Data Upload</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Use Data Hub inside each project
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Upload is now linked directly to a dataset. Open a project and use <strong>Data Hub</strong> to upload images and start training in one flow.
          </p>
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}/data`}>
                <Button variant="outline" className="w-full justify-start">{p.name} → Data Hub</Button>
              </Link>
            ))}
            {projects.length === 0 && (
              <Link to="/projects"><Button>Create a project first</Button></Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
