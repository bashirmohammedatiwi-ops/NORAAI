import { Link, Navigate } from 'react-router-dom';
import { useProjectsList } from '@/hooks/useProjects';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Plus, ArrowRight, FolderKanban, RefreshCw, AlertCircle } from 'lucide-react';

export default function DatasetBuilderLandingPage() {
  const { projects, isInitialLoading, isError, error, refetch, isFetching } = useProjectsList();

  if (isInitialLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground space-y-2">
        <p>Loading projects...</p>
        <p className="text-xs">This should only take a few seconds</p>
      </div>
    );
  }

  if (isError && !projects.length) {
    return (
      <div className="py-12 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive/80" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Failed to load projects'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Retry
          </Button>
          <Link to="/login">
            <Button variant="outline">Re-login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (projects.length === 1) {
    return <Navigate to={`/projects/${projects[0].id}/data`} replace />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Quick Start — Dataset Builder" />

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-4">
            <Sparkles className="h-12 w-12 mx-auto text-primary/40" />
            <p className="text-muted-foreground">Create a project first, then come back here.</p>
            <Link to="/projects"><Button><Plus className="h-4 w-4" /> Create Project</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}/data`}>
              <Card className="hover:shadow-card hover:border-primary/30 transition-all group">
                <CardContent className="flex items-center justify-between py-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FolderKanban className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold group-hover:text-primary transition-colors">{p.name}</p>
                      {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
