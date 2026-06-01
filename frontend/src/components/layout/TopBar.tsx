import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/builder': 'Quick Start',
  '/projects': 'Projects',
  '/ingestion': 'Ingestion',
  '/road-intelligence': 'Road Intelligence',
  '/fleet': 'Fleet',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  if (pathname.includes('/data')) return 'Data';
  if (pathname.includes('/datasets/')) return 'Dataset';
  if (pathname.includes('/datasets')) return 'Datasets';
  if (pathname.includes('/training')) return 'Training';
  if (pathname.includes('/model')) return 'Model';
  if (pathname.includes('/annotation')) return 'Review';
  if (pathname.includes('/classes')) return 'Classes';
  if (pathname.includes('/monitoring')) return 'Monitoring';
  if (pathname.match(/\/projects\/[^/]+$/)) return 'Overview';
  return 'NURAI';
}

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const title = getPageTitle(location.pathname);

  const logout = () => {
    api.clearToken();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </div>
      <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground shrink-0">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </header>
  );
}
