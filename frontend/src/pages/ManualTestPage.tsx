import { useProjectsList } from '@/hooks/useProjects';
import { DashboardManualTest } from '@/components/dashboard/DashboardManualTest';
import { PageHeader } from '@/components/layout/PageHeader';

export default function ManualTestPage() {
  const { projects, isInitialLoading } = useProjectsList();

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="اختبار يدوي" />
      {isInitialLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <DashboardManualTest projects={projects} />
      )}
    </div>
  );
}
