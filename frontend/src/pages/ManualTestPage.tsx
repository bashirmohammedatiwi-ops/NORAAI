import { useProjectsList } from '@/hooks/useProjects';
import { DashboardManualTest } from '@/components/dashboard/DashboardManualTest';
import { PageHeader } from '@/components/layout/PageHeader';

export default function ManualTestPage() {
  const { projects, isInitialLoading } = useProjectsList();

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Manual Test · اختبار يدوي" />
      {isInitialLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : (
        <DashboardManualTest projects={projects} />
      )}
    </div>
  );
}
