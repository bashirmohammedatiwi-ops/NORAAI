import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Plus } from 'lucide-react';

/** Entry point for Dataset Builder — pick a project or auto-open if only one. */
export default function DatasetBuilderLandingPage() {
  const [projects, setProjects] = useState<{ id: string; name: string; description: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects')
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  if (projects.length === 1) {
    return <Navigate to={`/projects/${projects[0].id}/data`} replace />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="h-8 w-8 text-primary" />
          Dataset Builder
        </h1>
        <p className="text-muted-foreground mt-1">Choose a project to upload images, assign classes, and train.</p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">No projects yet. Create one first.</p>
            <Link to="/projects"><Button><Plus className="h-4 w-4 mr-2" />Go to Projects</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Select project</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}/data`}>
                <Button variant="outline" className="w-full justify-start h-auto py-3">
                  <div className="text-left">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground font-normal">{p.description}</div>}
                  </div>
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
