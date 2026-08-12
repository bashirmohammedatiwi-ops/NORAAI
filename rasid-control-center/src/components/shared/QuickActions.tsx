import { Link } from 'react-router-dom';
import { FlaskConical, Map, Bell, Siren, BarChart3, MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';

const actions = [
  { to: '/command', label: 'مركز العمليات', desc: 'خريطة كاملة', icon: MonitorPlay, color: 'from-indigo-600 to-violet-700' },
  { to: '/lab', label: 'اختبار AI', desc: 'صورة أو فيديو', icon: FlaskConical, color: 'from-violet-500 to-purple-600' },
  { to: '/map', label: 'الخريطة', desc: 'عرض حي', icon: Map, color: 'from-teal-500 to-emerald-600' },
  { to: '/alerts', label: 'التنبيهات', desc: 'إدارة وإنهاء', icon: Bell, color: 'from-red-500 to-orange-600' },
  { to: '/emergency', label: 'طوارئ', desc: '911', icon: Siren, color: 'from-rose-600 to-red-700' },
  { to: '/analytics', label: 'تحليلات', desc: 'إحصائيات', icon: BarChart3, color: 'from-sky-500 to-blue-600' },
];

export function QuickActions() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {actions.map(({ to, label, desc, icon: Icon, color }) => (
        <Link
          key={to}
          to={to}
          className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className={cn('mb-3 inline-flex rounded-lg bg-gradient-to-br p-2.5 text-white shadow', color)}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="font-bold">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </Link>
      ))}
    </div>
  );
}
