import { useEffect, useRef, useState } from 'react';
import { Bell, Search, MapPin, Menu, Command, SlidersHorizontal } from 'lucide-react';
import { useProjects, useOverview } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NotificationDropdown } from '@/components/layout/NotificationDropdown';
import { useLayout } from '@/context/LayoutContext';
import { IRAQ_GOVERNORATES } from '@/lib/constants';

interface TopBarProps {
  title: string;
  subtitle?: string;
  live?: boolean;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, live, actions }: TopBarProps) {
  const { openMobileNav } = useLayout();
  const { projectId, setProjectId, governorateFilter, setGovernorateFilter, searchQuery, setSearchQuery } = useControlContext();
  const { data: projects = [] } = useProjects();
  const { data: overview } = useOverview(projectId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltersOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtersOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {openMobileNav && (
              <button type="button" onClick={openMobileNav} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border lg:hidden">
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-bold sm:text-xl">{title}</h1>
                {live && (
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    مباشر
                  </Badge>
                )}
              </div>
              {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent md:flex"
            >
              <Command className="h-3.5 w-3.5" />
              <span>انتقال سريع</span>
              <kbd className="rounded border bg-muted px-1">⌘K</kbd>
            </button>

            <div className="relative hidden sm:block">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="بحث في التنبيهات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-44 rounded-lg border border-border bg-background pr-9 pl-3 text-sm outline-none ring-primary focus:ring-2 lg:w-56"
              />
            </div>

            <div className="hidden items-center gap-1.5 sm:flex">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <select
                className="h-9 max-w-[120px] rounded-lg border border-border bg-background px-2 text-sm lg:max-w-[140px]"
                value={governorateFilter}
                onChange={(e) => setGovernorateFilter(e.target.value)}
              >
                <option value="all">كل العراق</option>
                {IRAQ_GOVERNORATES.map((g) => (
                  <option key={g.id} value={g.id}>{g.nameAr}</option>
                ))}
              </select>
            </div>

            <select
              className="hidden h-9 max-w-[120px] rounded-lg border border-border bg-background px-2 text-sm sm:block"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="sm:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              فلاتر
            </Button>

            <NotificationDropdown />

            {overview && overview.active_alerts > 0 && (
              <Badge className="hidden border-red-200 bg-red-50 text-red-700 sm:inline-flex">
                <Bell className="h-3 w-3" /> {overview.active_alerts}
              </Badge>
            )}

            {actions}
          </div>
        </div>
      </header>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 sm:hidden" onClick={() => setFiltersOpen(false)}>
          <div
            ref={sheetRef}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold">بحث وفلاتر</p>
              <button type="button" className="text-sm text-muted-foreground" onClick={() => setFiltersOpen(false)}>إغلاق</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">بحث</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="بحث في التنبيهات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background pr-9 pl-3 text-sm outline-none ring-primary focus:ring-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">المحافظة</label>
                <select
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={governorateFilter}
                  onChange={(e) => setGovernorateFilter(e.target.value)}
                >
                  <option value="all">كل العراق</option>
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option key={g.id} value={g.id}>{g.nameAr}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">المشروع</label>
                <select
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <Button className="w-full" onClick={() => setFiltersOpen(false)}>تطبيق</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
