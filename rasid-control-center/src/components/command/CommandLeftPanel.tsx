import {
  Filter, RotateCcw, Search, MapPin, BarChart3,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  EVENT_META, IRAQ_GOVERNORATES, RECIPIENT_TABS,
} from '@/lib/constants';
import type { AlertRecipient, EventType } from '@/types';
import type { CommandSort } from '@/hooks/useCommandFilters';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface CommandLeftPanelProps {
  search: string;
  onSearchChange: (v: string) => void;
  recipient: AlertRecipient | 'all';
  onRecipientChange: (v: AlertRecipient | 'all') => void;
  eventType: EventType | 'all';
  onEventTypeChange: (v: EventType | 'all') => void;
  governorate: string;
  onGovernorateChange: (v: string) => void;
  sort: CommandSort;
  onSortChange: (v: CommandSort) => void;
  onReset: () => void;
  hasFilters: boolean;
  typeStats: Record<string, number>;
  govStats: Record<string, number>;
  onGovJump: (govId: string) => void;
}

export function CommandLeftPanel({
  search,
  onSearchChange,
  recipient,
  onRecipientChange,
  eventType,
  onEventTypeChange,
  governorate,
  onGovernorateChange,
  sort,
  onSortChange,
  onReset,
  hasFilters,
  typeStats,
  govStats,
  onGovJump,
}: CommandLeftPanelProps) {
  const chartData = Object.entries(typeStats).map(([k, v]) => ({
    name: EVENT_META[k as EventType]?.labelAr ?? k,
    value: v,
    color: EVENT_META[k as EventType]?.color ?? '#64748b',
  }));

  const topGovs = Object.entries(govStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Filter className="h-4 w-4 text-primary" />
          فلاتر العمليات
        </span>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={onReset}>
            <RotateCcw className="h-3 w-3" /> مسح
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث في التنبيهات..."
            className="h-9 pr-8 text-xs"
          />
        </div>

        <FilterBlock label="الترتيب">
          <div className="flex flex-wrap gap-1">
            {([
              ['newest', 'الأحدث'],
              ['oldest', 'الأقدم'],
            ] as const).map(([id, label]) => (
              <Chip key={id} active={sort === id} onClick={() => onSortChange(id)}>{label}</Chip>
            ))}
          </div>
        </FilterBlock>

        <FilterBlock label="الجهة">
          <div className="flex flex-wrap gap-1">
            {RECIPIENT_TABS.map((t) => (
              <Chip key={t.id} active={recipient === t.id} onClick={() => onRecipientChange(t.id)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </FilterBlock>

        <FilterBlock label="نوع الحدث">
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            <Chip active={eventType === 'all'} onClick={() => onEventTypeChange('all')}>الكل</Chip>
            {(Object.keys(EVENT_META) as EventType[]).map((t) => (
              <Chip key={t} active={eventType === t} onClick={() => onEventTypeChange(t)}>
                {EVENT_META[t].labelAr}
              </Chip>
            ))}
          </div>
        </FilterBlock>

        <FilterBlock label="المحافظة">
          <select
            value={governorate}
            onChange={(e) => onGovernorateChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
          >
            <option value="all">كل العراق</option>
            {IRAQ_GOVERNORATES.map((g) => (
              <option key={g.id} value={g.id}>{g.nameAr}</option>
            ))}
          </select>
        </FilterBlock>

        {chartData.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> توزيع الأنواع
            </p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" innerRadius={28} outerRadius={48} paddingAngle={2}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {topGovs.length > 0 && (
          <div className="space-y-1 rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> أكثر المحافظات
            </p>
            {topGovs.map(([id, count]) => {
              const name = IRAQ_GOVERNORATES.find((g) => g.id === id)?.nameAr ?? id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onGovJump(id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs text-foreground transition hover:bg-accent"
                >
                  <span>{name}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
