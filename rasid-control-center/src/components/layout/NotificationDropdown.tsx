import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { EVENT_META } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';

export function NotificationDropdown() {
  const { projectId } = useControlContext();
  const { data: items = [] } = useNotifications(projectId);
  const active = items.filter((n) => n.is_active).slice(0, 5);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent"
        aria-expanded={open}
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {active.length > 0 && (
          <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {active.length}
          </span>
        )}
      </button>

      <div
        className={`absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-white shadow-xl transition-all ${
          open ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
        }`}
      >
        <div className="border-b px-4 py-3">
          <p className="font-bold">آخر الإشعارات</p>
          <p className="text-xs text-muted-foreground">{active.length} نشط</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {!items.length && <p className="p-3 text-center text-sm text-muted-foreground">لا إشعارات</p>}
          {items.slice(0, 6).map((n) => (
            <Link
              key={n.id}
              to={`/alerts?id=${n.id}`}
              className="block rounded-lg px-3 py-2 hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <p className="text-sm font-medium">{EVENT_META[n.event_type]?.labelAr ?? n.event_type}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{n.message}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelativeTime(n.created_at)}</p>
            </Link>
          ))}
        </div>
        <Link
          to="/notifications"
          className="block border-t px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-accent"
          onClick={() => setOpen(false)}
        >
          عرض الكل
        </Link>
      </div>
    </div>
  );
}
