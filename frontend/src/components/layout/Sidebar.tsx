import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Database, Map, Truck, FileText, Settings,
  Sparkles, Images, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', hint: 'Overview' },
  { to: '/projects', icon: FolderKanban, label: 'Projects', hint: 'All ML projects' },
  { to: '/builder', icon: Sparkles, label: 'Quick Start', hint: 'Upload & train' },
];

const dataNav = [
  { to: '/ingestion', icon: Database, label: 'Ingestion', hint: 'Upload pipeline' },
];

const opsNav = [
  { to: '/road-intelligence', icon: Map, label: 'Road Intel', hint: 'Events & maps' },
  { to: '/fleet', icon: Truck, label: 'Fleet', hint: 'Edge devices' },
  { to: '/reports', icon: FileText, label: 'Reports', hint: 'Analytics' },
];

function NavSection({ title, items }: { title: string; items: typeof mainNav }) {
  const location = useLocation();

  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{title}</p>
      {items.map(({ to, icon: Icon, label, hint }) => {
        const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
              active
                ? 'bg-sidebar-accent text-primary shadow-sm'
                : 'text-sidebar-foreground/80 hover:bg-accent hover:text-foreground'
            )}
          >
            <span className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground group-hover:bg-card'
            )}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium leading-tight">{label}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{hint}</span>
            </span>
            {active && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar min-h-screen">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
          <Images className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-base text-foreground">NORAAI</h1>
          <p className="text-xs text-muted-foreground">Smart Road AI Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        <NavSection title="Main" items={mainNav} />
        <NavSection title="Data" items={dataNav} />
        <NavSection title="Operations" items={opsNav} />
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-2">
        <Link
          to="/settings"
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
            location.pathname === '/settings' ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground hover:bg-accent'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-800">System online</span>
          </div>
          <Badge variant="success" className="mt-2">Ready for training</Badge>
        </div>
      </div>
    </aside>
  );
}
