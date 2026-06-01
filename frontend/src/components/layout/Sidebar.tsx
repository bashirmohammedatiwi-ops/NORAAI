import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Sparkles, Database, Map, Truck, FileText, Settings, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navGroups = [
  {
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/projects', icon: FolderKanban, label: 'Projects' },
      { to: '/builder', icon: Sparkles, label: 'Quick Start' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/ingestion', icon: Database, label: 'Ingestion' },
      { to: '/road-intelligence', icon: Map, label: 'Road Intel' },
      { to: '/fleet', icon: Truck, label: 'Fleet' },
      { to: '/reports', icon: FileText, label: 'Reports' },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <>
      {navGroups.map((group, i) => (
        <div key={i} className="space-y-0.5">
          {group.title && (
            <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          )}
          {group.items.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                className={cn('nav-link', active && 'nav-link-active')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();

  const footer = (
    <Link
      to="/settings"
      onClick={onMobileClose}
      className={cn('nav-link', location.pathname === '/settings' && 'nav-link-active')}
    >
      <Settings className="h-4 w-4" />
      Settings
    </Link>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar min-h-screen">
        <div className="border-b border-sidebar-border px-4 py-4">
          <p className="text-sm font-semibold">NURAI</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </nav>
        <div className="border-t border-sidebar-border p-3">{footer}</div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar shadow-xl">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
              <p className="text-sm font-semibold">NURAI</p>
              <button type="button" onClick={onMobileClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <NavLinks onNavigate={onMobileClose} />
            </nav>
            <div className="border-t border-sidebar-border p-3">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}
