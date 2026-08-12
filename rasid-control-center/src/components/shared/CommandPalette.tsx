import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Bell, Map, Truck, Building2, Brain, Radio,
  BarChart3, Siren, FileText, FlaskConical, Activity, Search,
  MonitorPlay, Server, Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const pages = [
  { to: '/command', label: 'مركز العمليات', icon: MonitorPlay, group: 'عمليات' },
  { to: '/', label: 'نظرة عامة', icon: LayoutDashboard, group: 'عمليات' },
  { to: '/alerts', label: 'التنبيهات', icon: Bell, group: 'عمليات' },
  { to: '/map', label: 'الخريطة الحية', icon: Map, group: 'عمليات' },
  { to: '/emergency', label: 'غرفة الطوارئ', icon: Siren, group: 'عمليات' },
  { to: '/activity', label: 'سجل النشاط', icon: Activity, group: 'عمليات' },
  { to: '/fleet', label: 'المركبات', icon: Truck, group: 'أسطول' },
  { to: '/municipalities', label: 'المحافظات', icon: Building2, group: 'أسطول' },
  { to: '/notifications', label: 'الإشعارات', icon: Radio, group: 'أسطول' },
  { to: '/analytics', label: 'التحليلات', icon: BarChart3, group: 'ذكاء' },
  { to: '/lab', label: 'مختبر الاختبار', icon: FlaskConical, group: 'ذكاء' },
  { to: '/models', label: 'نماذج AI', icon: Brain, group: 'ذكاء' },
  { to: '/reports', label: 'التقارير', icon: FileText, group: 'ذكاء' },
  { to: '/system', label: 'صحة النظام', icon: Server, group: 'منصة' },
  { to: '/integrations', label: 'التكاملات', icon: Plug, group: 'منصة' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term) return pages;
    return pages.filter((p) => p.label.includes(term) || p.group.includes(term));
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="انتقل إلى صفحة... (Ctrl+K)"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((p) => (
            <button
              key={p.to}
              type="button"
              onClick={() => { navigate(p.to); setOpen(false); setQ(''); }}
              className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-sm transition hover:bg-accent')}
            >
              <p.icon className="h-4 w-4 text-primary" />
              <span className="flex-1 font-medium">{p.label}</span>
              <span className="text-[10px] text-muted-foreground">{p.group}</span>
            </button>
          ))}
          {!filtered.length && <p className="p-4 text-center text-sm text-muted-foreground">لا نتائج</p>}
        </div>
      </div>
    </div>
  );
}
