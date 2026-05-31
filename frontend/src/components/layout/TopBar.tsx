import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/builder': 'Dataset Builder',
  '/projects': 'Projects',
  '/ingestion': 'Ingestion',
  '/road-intelligence': 'Road Intelligence',
  '/fleet': 'Fleet Devices',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  if (pathname.includes('/data')) return 'Dataset Builder';
  if (pathname.includes('/datasets/')) return 'Dataset Gallery';
  if (pathname.includes('/datasets')) return 'Browse Datasets';
  if (pathname.includes('/training')) return 'Training';
  if (pathname.includes('/models')) return 'Models';
  if (pathname.includes('/deployments')) return 'Deployments';
  if (pathname.includes('/annotation')) return 'Annotation';
  if (pathname.includes('/classes')) return 'Classes';
  if (pathname.includes('/monitoring')) return 'Monitoring';
  if (pathname.match(/\/projects\/[^/]+$/)) return 'Project Overview';
  return 'NORAAI';
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = getPageTitle(location.pathname);

  const logout = () => {
    api.clearToken();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/80 bg-card/80 px-6 backdrop-blur-md">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">NORAAI Platform</p>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
