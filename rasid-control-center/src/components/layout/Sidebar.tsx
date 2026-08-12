import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Bell, Map, Truck, Building2, Brain, Radio, LogOut,
  BarChart3, Siren, FileText, ChevronLeft, FlaskConical, Activity, X,
  MonitorPlay, Server, Plug, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { APP_NAME, APP_REGION } from '@/lib/constants';
import { useCurrentUser, useOverview } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';

const navGroups = [
  {
    title: 'العمليات',
    items: [
      { to: '/command', icon: MonitorPlay, label: 'مركز العمليات' },
      { to: '/', icon: LayoutDashboard, label: 'نظرة عامة' },
      { to: '/alerts', icon: Bell, label: 'التنبيهات', badgeKey: 'alerts' as const },
      { to: '/map', icon: Map, label: 'الخريطة الحية' },
      { to: '/emergency', icon: Siren, label: 'غرفة الطوارئ' },
      { to: '/activity', icon: Activity, label: 'سجل النشاط' },
    ],
  },
  {
    title: 'الأسطول والمناطق',
    items: [
      { to: '/fleet', icon: Truck, label: 'المركبات' },
      { to: '/municipalities', icon: Building2, label: 'المحافظات' },
      { to: '/notifications', icon: Radio, label: 'الإشعارات' },
    ],
  },
  {
    title: 'الذكاء والتقارير',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'التحليلات' },
      { to: '/lab', icon: FlaskConical, label: 'مختبر الاختبار' },
      { to: '/models', icon: Brain, label: 'نماذج AI' },
      { to: '/reports', icon: FileText, label: 'التقارير' },
    ],
  },
  {
    title: 'المنصة',
    items: [
      { to: '/system', icon: Server, label: 'صحة النظام' },
      { to: '/integrations', icon: Plug, label: 'التكاملات' },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const { projectId } = useControlContext();
  const { data: overview } = useOverview(projectId);
  const { data: user } = useCurrentUser();
  const activeAlerts = overview?.active_alerts ?? 0;

  const content = (
    <>
      <div className="iraq-strip" />
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 text-lg font-black text-white shadow-md">
              ر
            </div>
            <div>
              <p className="text-base font-bold text-sidebar-foreground">{APP_NAME}</p>
              <p className="text-[11px] text-sidebar-muted">{APP_REGION}</p>
            </div>
          </div>
          {onMobileClose && (
            <button type="button" onClick={onMobileClose} className="rounded-lg p-2 hover:bg-accent lg:hidden">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {activeAlerts} تنبيه · {overview?.vehicles_online ?? 0} مركبة
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, badgeKey }) => {
                const active = location.pathname === to;
                const badge = badgeKey === 'alerts' && activeAlerts > 0 ? activeAlerts : null;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={onMobileClose}
                    className={cn('nav-link', active ? 'nav-link-active' : 'nav-link-idle')}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{label}</span>
                    {badge != null && (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span>
                    )}
                    {active && <ChevronLeft className="h-3.5 w-3.5 opacity-50" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        {user && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {user.full_name?.[0] ?? <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user.full_name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <p className="font-semibold text-foreground">مركز العمليات v4</p>
          <p>REST · WebSocket · AI Lab</p>
        </div>
        <button
          type="button"
          onClick={() => { api.clearSession(); window.location.href = '/login'; }}
          className="nav-link nav-link-idle w-full"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden h-full w-[272px] shrink-0 flex-col border-l border-sidebar-border bg-sidebar shadow-sm lg:flex">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="absolute right-0 top-0 flex h-full w-[280px] flex-col bg-sidebar shadow-2xl animate-slide-in-rtl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
