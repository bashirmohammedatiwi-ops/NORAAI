import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useNotifications } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { eventMeta, alertImageUrl } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/types';

type Tab = 'all' | 'active' | 'done';

export default function NotificationsPage() {
  const { projectId } = useControlContext();
  const { data: items = [], isLoading } = useNotifications(projectId);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (tab === 'active' && !n.is_active) return false;
      if (tab === 'done' && n.is_active) return false;
      if (q.trim()) {
        const term = q.trim();
        const meta = eventMeta(n.event_type);
        if (!n.message.includes(term) && !meta.labelAr.includes(term) && !n.event_type.includes(term)) return false;
      }
      return true;
    });
  }, [items, tab, q]);

  const activeCount = items.filter((n) => n.is_active).length;

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="الإشعارات" subtitle={`${activeCount} نشطة · ${items.length} إجمالي`} live />

      <div className="page-body space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="pr-9" />
          </div>
          <div className="flex rounded-lg border border-border p-1">
            {([
              ['all', 'الكل'],
              ['active', 'نشطة'],
              ['done', 'منتهية'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {isLoading && <p className="text-muted-foreground">جاري التحميل...</p>}
          {!isLoading && !filtered.length && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا إشعارات مطابقة</CardContent></Card>
          )}
          {filtered.map((n) => <NotificationRow key={n.id} item={n} />)}
        </div>
      </div>
    </div>
  );
}

function NotificationRow({ item: n }: { item: NotificationItem }) {
  const meta = eventMeta(n.event_type);
  return (
    <Card className={n.is_active ? 'ring-1 ring-primary/10' : 'opacity-80'}>
      <CardContent className="flex gap-4 p-4">
        <img src={alertImageUrl(n)} alt="" className="h-16 w-24 shrink-0 rounded-lg border object-cover shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border" style={{ background: `${meta.color}12`, color: meta.color, borderColor: `${meta.color}33` }}>
              {meta.labelAr}
            </Badge>
            {!n.is_active && <Badge className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">منتهي</Badge>}
            <span className="text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</span>
          </div>
          <p className="mt-1 text-sm">{n.message}</p>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/alerts?id=${n.id}`}><ExternalLink className="h-3 w-3" /> عرض في التنبيهات</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
