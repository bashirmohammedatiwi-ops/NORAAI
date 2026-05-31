import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Map, Truck, FileText, Settings, Brain, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/road-intelligence', icon: Map, label: 'Road Intel' },
  { to: '/fleet', icon: Truck, label: 'Fleet' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 border-r border-border bg-card min-h-screen p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-8 px-2">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="font-bold text-lg">AI Ops Center</h1>
          <p className="text-xs text-muted-foreground">MLOps Platform</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto px-2 py-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3 text-green-500" />
          System Online
        </div>
      </div>
    </aside>
  );
}
