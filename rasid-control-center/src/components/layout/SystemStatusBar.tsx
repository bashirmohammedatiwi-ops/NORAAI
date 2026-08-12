import { Link } from 'react-router-dom';
import { Activity, Database, Radio, Server, Zap } from 'lucide-react';
import { useSystemStatus } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { cn } from '@/lib/utils';

const statusColor: Record<string, string> = {
  ok: 'bg-emerald-500',
  connected: 'bg-emerald-500',
  ready: 'bg-emerald-500',
  offline: 'bg-amber-500',
  error: 'bg-red-500',
  needs_key: 'bg-amber-500',
};

function dot(status: string) {
  return statusColor[status] ?? 'bg-muted-foreground';
}

export function SystemStatusBar({ projectId }: { projectId: string }) {
  const { wsConnected } = useControlContext();
  const { data } = useSystemStatus(projectId);

  if (!data) return null;

  const wsStatus = wsConnected ? 'connected' : data.websocket.status;

  const items = [
    { icon: Database, label: 'DB', status: data.database.status },
    { icon: Server, label: 'Redis', status: data.redis.status },
    { icon: Zap, label: 'Lab', status: data.lab.api_key_configured ? 'connected' : 'needs_key' },
    { icon: Radio, label: wsConnected ? 'WS مباشر' : 'WS', status: wsStatus },
    { icon: Activity, label: 'v4', status: 'ready' },
  ];

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/80 px-4 py-1.5 text-[10px] text-muted-foreground backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        {items.map(({ icon: Icon, label, status }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', dot(status))} />
            <Icon className="h-3 w-3 opacity-60" />
            {label}
          </span>
        ))}
        <span className="hidden sm:inline">· {data.fleet.online}/{data.fleet.total} مركبة</span>
      </div>
      <Link to="/system" className="font-medium text-primary hover:underline">
        صحة النظام
      </Link>
    </div>
  );
}
