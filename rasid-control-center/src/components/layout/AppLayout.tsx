import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { SystemStatusBar } from './SystemStatusBar';
import { useProjects } from '@/hooks/useControlCenter';
import { useRoadWebSocket } from '@/hooks/useRoadWebSocket';
import { ControlProvider } from '@/context/ControlContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { LayoutProvider } from '@/context/LayoutContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { loadPreferences } from '@/lib/preferences';
import { initTheme } from '@/lib/theme';
import { eventMeta } from '@/lib/constants';
import type { RoadAlert } from '@/types';

function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const hideStatusBar = location.pathname === '/command';
  const { toast } = useToast();
  const { data: projects = [], isLoading, isError, error, refetch } = useProjects();
  const [projectId, setProjectId] = useState(api.getProjectId() ?? '');
  const [mobileNav, setMobileNav] = useState(false);

  const resolvedProjectId = useMemo(() => {
    if (!projects.length) return '';
    if (projectId && projects.some((p) => p.id === projectId)) return projectId;
    return projects[0].id;
  }, [projects, projectId]);

  useEffect(() => {
    initTheme();
    if (!localStorage.getItem('rasid_cc_token')) navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    const prefs = loadPreferences();
    document.body.classList.toggle('compact-mode', prefs.compactMode);
  }, []);

  useEffect(() => {
    if (!resolvedProjectId) return;
    if (resolvedProjectId !== projectId) setProjectId(resolvedProjectId);
    if (api.getProjectId() !== resolvedProjectId) api.setProjectId(resolvedProjectId);
  }, [resolvedProjectId, projectId]);

  const wsConnected = useRoadWebSocket(resolvedProjectId || null, {
    onAlert: (alert: RoadAlert) => {
      const prefs = loadPreferences();
      const meta = eventMeta(alert.event_type);
      const urgent = alert.event_type === 'accident';
      if (prefs.soundAlerts) {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.frequency.value = urgent ? 880 : 660;
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch { /* ignore */ }
      }
      toast({
        title: meta?.labelAr ?? 'تنبيه جديد',
        message: `${alert.latitude.toFixed(3)}, ${alert.longitude.toFixed(3)}`,
        tone: urgent ? 'error' : 'info',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center animate-fade-in">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface-elevated max-w-md p-8 text-center">
          <p className="text-lg font-bold text-red-700">تعذّر تحميل لوحة التحكم</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'تحقق من اتصال الخادم'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
            <Button size="sm" variant="outline" onClick={() => { api.clearSession(); navigate('/login'); }}>
              تسجيل الدخول
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface-elevated max-w-md p-8 text-center">
          <p className="text-lg font-bold">لا توجد مشاريع</p>
          <p className="mt-2 text-sm text-muted-foreground">أنشئ مشروعاً من Rasid Console أولاً</p>
        </div>
      </div>
    );
  }

  if (!resolvedProjectId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center animate-fade-in">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">جاري تحضير المشروع...</p>
        </div>
      </div>
    );
  }

  const handleSetProject = (id: string) => {
    setProjectId(id);
    api.setProjectId(id);
  };

  return (
    <PreferencesProvider>
      <ControlProvider projectId={resolvedProjectId} setProjectId={handleSetProject} wsConnected={wsConnected}>
        <LayoutProvider openMobileNav={() => setMobileNav(true)}>
          <div className="flex min-h-screen">
            <Sidebar mobileOpen={mobileNav} onMobileClose={() => setMobileNav(false)} />
            <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
              {!hideStatusBar && <SystemStatusBar projectId={resolvedProjectId} />}
            </main>
          </div>
          <CommandPalette />
        </LayoutProvider>
      </ControlProvider>
    </PreferencesProvider>
  );
}

export function AppLayout() {
  return (
    <ToastProvider>
      <LayoutInner />
    </ToastProvider>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('rasid_cc_token')) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
