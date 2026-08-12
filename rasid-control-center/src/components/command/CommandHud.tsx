import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Maximize2, Minimize2, Radio, Siren, Brain, Wifi, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Layers, Flame, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CommandHudProps {
  modelName?: string | null;
  activeAlerts: number;
  fleetOnline: number;
  fleetTotal: number;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  showHeat: boolean;
  onToggleHeat: () => void;
  showFleet: boolean;
  onToggleFleet: () => void;
  wsLive?: boolean;
}

export function CommandHud({
  modelName,
  activeAlerts,
  fleetOnline,
  fleetTotal,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  fullscreen,
  onToggleFullscreen,
  showHeat,
  onToggleHeat,
  showFleet,
  onToggleFleet,
  wsLive = true,
}: CommandHudProps) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="command-hud relative z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="iraq-strip" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 text-lg font-black text-white shadow-md">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">مركز العمليات</h1>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                مباشر
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {activeAlerts} تنبيه نشط · {fleetOnline}/{fleetTotal} مركبة · {modelName ?? '—'}
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 md:flex">
          <Clock className="h-4 w-4 text-primary" />
          <div dir="ltr" className="text-left">
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">{timeStr}</p>
            <p className="text-[10px] text-muted-foreground">{dateStr}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(
            'hidden items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium sm:inline-flex',
            wsLive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
          )}>
            <Wifi className="h-3 w-3" />
            {wsLive ? 'متصل' : 'جاري…'}
          </span>

          <ToolbarBtn active={showHeat} onClick={onToggleHeat} title="طبقة الكثافة">
            <Flame className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn active={showFleet} onClick={onToggleFleet} title="الأسطول">
            <Layers className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn active={leftOpen} onClick={onToggleLeft} title="لوحة الفلاتر">
            {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </ToolbarBtn>
          <ToolbarBtn active={rightOpen} onClick={onToggleRight} title="قائمة التنبيهات">
            {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </ToolbarBtn>
          <ToolbarBtn active={fullscreen} onClick={onToggleFullscreen} title="ملء الشاشة">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolbarBtn>

          <Button size="sm" variant="outline" className="hidden h-8 sm:inline-flex" asChild>
            <Link to="/emergency"><Siren className="h-4 w-4" /> طوارئ</Link>
          </Button>
          <Button size="sm" variant="outline" className="hidden h-8 sm:inline-flex" asChild>
            <Link to="/"><Radio className="h-4 w-4" /> لوحة</Link>
          </Button>
          <Button size="sm" variant="ghost" className="hidden h-8 text-primary lg:inline-flex" asChild>
            <Link to="/lab"><Brain className="h-4 w-4" /> Lab</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ToolbarBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg border transition',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
