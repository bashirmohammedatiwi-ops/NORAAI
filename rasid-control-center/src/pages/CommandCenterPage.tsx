import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandMap, type MapFocusPoint } from '@/components/command/CommandMap';
import { CommandHud } from '@/components/command/CommandHud';
import { CommandKpiBar } from '@/components/command/CommandKpiBar';
import { CommandTicker } from '@/components/command/CommandTicker';
import { CommandLeftPanel } from '@/components/command/CommandLeftPanel';
import { CommandRightPanel } from '@/components/command/CommandRightPanel';
import { AlertDetailPanel } from '@/components/alerts/AlertCard';
import { useAlerts, useFleet, useOverview, useResolveAlert, useRoadStats } from '@/hooks/useControlCenter';
import { useCommandFilters } from '@/hooks/useCommandFilters';
import { useControlContext } from '@/context/ControlContext';
import { usePreferences, useShowFleetOnMap } from '@/context/PreferencesContext';
import { eventMeta, IRAQ_GOVERNORATES } from '@/lib/constants';
import { avgConfidence } from '@/lib/analytics';
import { AlertTriangle, Car, TrendingUp, Zap } from 'lucide-react';
import type { RoadAlert } from '@/types';

export default function CommandCenterPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { projectId, wsConnected } = useControlContext();
  const { updatePreferences } = usePreferences();
  const { data: overview } = useOverview(projectId);
  const { data: stats } = useRoadStats(projectId);
  const { data: alertsRaw = [] } = useAlerts(projectId, { activeOnly: true });
  const { data: fleet = [] } = useFleet(projectId);
  const resolve = useResolveAlert(projectId);

  const filters = useCommandFilters(alertsRaw);
  const { filtered, stats: filterStats } = filters;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [mobileFilters, setMobileFilters] = useState(false);
  const showFleet = useShowFleetOnMap();
  const setShowFleet = (value: boolean) => updatePreferences({ showFleetOnMap: value });
  const [mapFocusPoint, setMapFocusPoint] = useState<MapFocusPoint | null>(null);

  const selected = useMemo(
    () => (selectedId ? filtered.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, filtered],
  );

  const avgAgeMinutes = useMemo(() => {
    if (!filtered.length) return null;
    const now = Date.now();
    const avg = filtered.reduce((s, a) => s + (now - new Date(a.created_at).getTime()), 0) / filtered.length;
    return Math.max(1, Math.round(avg / 60000));
  }, [filtered]);

  const confidence = avgConfidence(filtered);

  const selectAlert = useCallback((alert: RoadAlert | null) => {
    setSelectedId(alert?.id ?? null);
    setMapFocusPoint(null);
    if (alert && !rightOpen) setRightOpen(true);
  }, [rightOpen]);

  const jumpGovernorate = useCallback((govId: string) => {
    const gov = IRAQ_GOVERNORATES.find((g) => g.id === govId);
    if (!gov) return;
    filters.setGovernorate(govId);
    setSelectedId(null);
    setMapFocusPoint({ lat: gov.center[0], lng: gov.center[1], zoom: 9 });
  }, [filters]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await rootRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (document.fullscreenElement) document.exitFullscreen();
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void toggleFullscreen();
      }
      if (e.key === '1') setLeftOpen((v) => !v);
      if (e.key === '2') setRightOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, toggleFullscreen]);

  const handleResolve = (id: string) => {
    resolve.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) setSelectedId(null);
      },
    });
  };

  const kpiItems = [
    { label: 'تنبيهات نشطة', value: filtered.length, icon: AlertTriangle, tone: 'danger' as const },
    { label: 'مركبات', value: `${overview?.vehicles_online ?? 0}/${overview?.vehicles_total ?? 0}`, icon: Car, tone: 'success' as const },
    { label: 'حوادث', value: stats?.active_accidents ?? 0, icon: Zap, tone: 'warning' as const },
    { label: 'دقة AI', value: confidence != null ? `${confidence}%` : '—', icon: TrendingUp, tone: 'info' as const },
    { label: 'حفر', value: stats?.potholes_detected ?? 0, icon: AlertTriangle, tone: 'default' as const },
    { label: 'مطبات', value: stats?.speed_bumps_detected ?? 0, icon: TrendingUp, tone: 'default' as const },
  ];

  return (
    <div ref={rootRef} className="command-center-root relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <CommandHud
        modelName={stats?.active_model?.name}
        activeAlerts={filtered.length}
        fleetOnline={overview?.vehicles_online ?? 0}
        fleetTotal={overview?.vehicles_total ?? 0}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        fullscreen={fullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        showHeat={showHeat}
        onToggleHeat={() => setShowHeat((v) => !v)}
        showFleet={showFleet}
        onToggleFleet={() => setShowFleet(!showFleet)}
        wsLive={wsConnected}
      />

      <CommandKpiBar items={kpiItems} />

      <CommandTicker alerts={filtered} onSelect={selectAlert} />

      <div className="relative flex min-h-0 flex-1 gap-3 px-4 pb-4 pt-1 sm:px-5">
        {leftOpen && (
          <div className="hidden w-[280px] shrink-0 overflow-hidden lg:block xl:w-[300px]">
            <CommandLeftPanel
              search={filters.search}
              onSearchChange={filters.setSearch}
              recipient={filters.recipient}
              onRecipientChange={filters.setRecipient}
              eventType={filters.eventType}
              onEventTypeChange={filters.setEventType}
              governorate={filters.governorate}
              onGovernorateChange={filters.setGovernorate}
              sort={filters.sort}
              onSortChange={filters.setSort}
              onReset={filters.resetFilters}
              hasFilters={filters.hasFilters}
              typeStats={filterStats.byType}
              govStats={filterStats.byGov}
              onGovJump={jumpGovernorate}
            />
          </div>
        )}

        {mobileFilters && (
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileFilters(false)}>
            <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">فلاتر التنبيهات</p>
                <button type="button" className="text-sm text-muted-foreground" onClick={() => setMobileFilters(false)}>إغلاق</button>
              </div>
              <CommandLeftPanel
                search={filters.search}
                onSearchChange={filters.setSearch}
                recipient={filters.recipient}
                onRecipientChange={filters.setRecipient}
                eventType={filters.eventType}
                onEventTypeChange={filters.setEventType}
                governorate={filters.governorate}
                onGovernorateChange={filters.setGovernorate}
                sort={filters.sort}
                onSortChange={filters.setSort}
                onReset={filters.resetFilters}
                hasFilters={filters.hasFilters}
                typeStats={filterStats.byType}
                govStats={filterStats.byGov}
                onGovJump={(govId) => { jumpGovernorate(govId); setMobileFilters(false); }}
              />
            </div>
          </div>
        )}

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-black/[0.04]">
          <CommandMap
            alerts={filtered}
            vehicles={showFleet ? fleet : []}
            selectedId={selectedId}
            focusPoint={mapFocusPoint}
            onSelect={selectAlert}
            showHeat={showHeat}
            autoFit={filtered.length > 0}
          />

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
            <kbd className="rounded border bg-muted px-1">F</kbd> ملء الشاشة · <kbd className="rounded border bg-muted px-1">1</kbd> فلاتر · <kbd className="rounded border bg-muted px-1">2</kbd> قائمة
          </div>

          <button
            type="button"
            onClick={() => setMobileFilters(true)}
            className="pointer-events-auto absolute bottom-3 right-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm lg:hidden"
          >
            فلاتر ({filtered.length})
          </button>

          {filtered.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
              <div className="rounded-2xl border border-border bg-card px-8 py-6 text-center shadow-lg">
                <p className="text-base font-bold text-foreground">الوضع هادئ</p>
                <p className="mt-1 text-sm text-muted-foreground">لا تنبيهات نشطة على الخريطة</p>
              </div>
            </div>
          )}
        </div>

        {rightOpen && (
          <div className="hidden w-[320px] shrink-0 overflow-hidden lg:block xl:w-[360px]">
            <CommandRightPanel
              alerts={filtered}
              selected={selected}
              onSelect={selectAlert}
              onResolve={handleResolve}
              resolving={resolve.isPending}
              fleet={fleet}
              avgAgeMinutes={avgAgeMinutes}
              projectId={projectId}
            />
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-auto border-t border-border bg-background shadow-2xl lg:hidden">
          <AlertDetailPanel
            alert={selected}
            onClose={() => setSelectedId(null)}
            onResolve={handleResolve}
            resolving={resolve.isPending}
            projectId={projectId}
          />
        </div>
      )}

      <div className="max-h-44 shrink-0 overflow-y-auto border-t border-border bg-card p-3 lg:hidden">
        <p className="mb-2 text-xs font-bold text-foreground">التنبيهات ({filtered.length})</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filtered.slice(0, 14).map((a) => {
            const meta = eventMeta(a.event_type);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => selectAlert(a)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-right text-xs transition ${
                  selected?.id === a.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border bg-background hover:bg-accent'
                }`}
              >
                <span className="font-bold" style={{ color: meta.color }}>{meta.labelAr}</span>
                {a.title ? (
                  <span className="mt-0.5 block max-w-[120px] truncate text-[10px] text-muted-foreground">{a.title}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
