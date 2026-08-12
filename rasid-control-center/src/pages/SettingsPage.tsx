import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useControlContext } from '@/context/ControlContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useToast } from '@/context/ToastContext';
import { APP_NAME, APP_REGION, IRAQ_GOVERNORATES, governorateName } from '@/lib/constants';
import { useOverview, useSeedDemo, useAttachDemoImages, type DemoSeedResult } from '@/hooks/useControlCenter';
import { Bell, Gauge, Map, RefreshCw, Database, ImageIcon, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-right transition hover:bg-accent/50">
      <div>
        <p className="font-semibold">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <span className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-primary' : 'bg-muted')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-0.5' : 'right-0.5')} />
      </span>
    </button>
  );
}

function seedMessage(r: DemoSeedResult): string {
  const parts: string[] = [];
  if (r.alerts != null) parts.push(`${r.alerts} تنبيه`);
  if (r.vehicles != null) parts.push(`${r.vehicles} مركبة`);
  if (r.source_vehicle) parts.push(`مصدر: ${r.source_vehicle}`);
  if (r.images_attached) parts.push(`${r.images_attached} صورة`);
  if (r.alerts_added) parts.push(`+${r.alerts_added} جديد`);
  if (r.alerts_reassigned) parts.push(`تحديث ${r.alerts_reassigned} تنبيه`);
  if (r.speed_violations) parts.push(`${r.speed_violations} مخالفة سرعة`);
  return parts.join(' · ') || r.reason || '';
}

export default function SettingsPage() {
  const { projectId, governorateFilter, searchQuery, setGovernorateFilter } = useControlContext();
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  const { data: overview } = useOverview(projectId);
  const [confirmForce, setConfirmForce] = useState(false);

  const update = (patch: Parameters<typeof updatePreferences>[0]) => {
    const next = updatePreferences(patch);
    if (patch.compactMode != null) {
      document.body.classList.toggle('compact-mode', next.compactMode);
    }
    toast({ title: 'تم حفظ الإعدادات', tone: 'success' });
  };

  return (
    <div className="page-shell animate-fade-in">
      <TopBar title="الإعدادات" subtitle="تخصيص تجربة لوحة التحكم" />

      <div className="page-body max-w-3xl space-y-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" />التفضيلات</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Toggle checked={preferences.compactMode} onChange={(v) => update({ compactMode: v })} label="الوضع المضغوط" desc="مسافات أقل وبطاقات أصغر" />
            <Toggle checked={preferences.autoRefresh} onChange={(v) => update({ autoRefresh: v })} label="تحديث تلقائي" desc="Polling للبيانات الحية — يُطبَّق فوراً" />
            <Toggle checked={preferences.showFleetOnMap} onChange={(v) => update({ showFleetOnMap: v })} label="عرض الأسطول على الخريطة" desc="نقاط المركبات الزرقاء" />
            <Toggle checked={preferences.soundAlerts} onChange={(v) => update({ soundAlerts: v })} label="تنبيه صوتي" desc="صوت قصير عند وصول تنبيه WebSocket" />
            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 font-semibold">المحافظة الافتراضية</p>
              <select
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={governorateFilter}
                onChange={(e) => setGovernorateFilter(e.target.value)}
              >
                <option value="all">كل العراق</option>
                {IRAQ_GOVERNORATES.map((g) => (
                  <option key={g.id} value={g.id}>{g.nameAr}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" />بيانات العرض</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">23 تنبيه</strong>: 21 في الزيونة (محلة 712 + شارع 714-20) + <strong className="text-foreground">2 مخالفة سرعة</strong> في حي الأمين (حد 40 كم/س).</p>
              <p className="mt-2"><strong className="text-foreground">10 مركبات</strong> — كلها في بغداد (RASID-BGD-01 … 10).</p>
              <p className="mt-2">كل التنبيهات من مركبة <code className="rounded bg-muted px-1">RASID-BGD-02</code>.</p>
              <p className="mt-2">للصور: <code className="rounded bg-muted px-1">MUN-712-001.jpg</code> … <code className="rounded bg-muted px-1">021</code> و<code className="rounded bg-muted px-1">TRF-AME-001.jpg</code> … <code className="rounded bg-muted px-1">002</code></p>
            </div>

            {overview && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="chip border bg-card">نشط: {overview.active_alerts}</span>
                <span className="chip border bg-card">مركبات: {overview.vehicles_total}</span>
                <span className="chip border bg-card">منتهي: {overview.resolved_total}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <SeedDemoButton projectId={projectId} />
              {!confirmForce ? (
                <Button size="sm" variant="outline" onClick={() => setConfirmForce(true)}>
                  <RotateCcw className="h-4 w-4" /> إعادة التحميل
                </Button>
              ) : (
                <ForceSeedDemoButton projectId={projectId} onDone={() => setConfirmForce(false)} />
              )}
              <AttachDemoImagesButton projectId={projectId} />
            </div>
            {confirmForce && (
              <p className="text-xs text-amber-700">سيتم حذف تنبيهات العرض الحالية وإنشاؤها من جديد.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5 text-primary" />المنصة</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><strong className="text-foreground">{APP_NAME}</strong> — {APP_REGION}</p>
            <p className="text-muted-foreground">لوحة التحكم v4 · REST + WebSocket + AI Lab</p>
            <p>المشروع: <code className="rounded bg-muted px-1">{projectId}</code></p>
            <p>فلتر المحافظة: {governorateFilter === 'all' ? 'كل العراق' : governorateName(governorateFilter)}</p>
            <p>بحث نشط: {searchQuery || '—'}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => { localStorage.removeItem('rasid_lab_history'); toast({ title: 'تم مسح سجل المختبر', tone: 'info' }); }}>
                <RefreshCw className="h-4 w-4" /> مسح سجل المختبر
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />التغطية — {IRAQ_GOVERNORATES.length} محافظة</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {IRAQ_GOVERNORATES.map((g) => (
                <span key={g.id} className="chip border bg-card text-xs">{g.nameAr}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SeedDemoButton({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const seed = useSeedDemo(projectId);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={seed.isPending}
      onClick={() => {
        seed.mutate(false, {
          onSuccess: (r) => {
            if (r.seeded) {
              toast({ title: 'تم تحميل بيانات العرض', message: seedMessage(r), tone: 'success' });
            } else {
              toast({ title: 'البيانات موجودة', message: seedMessage(r), tone: 'info' });
            }
          },
          onError: (e) => toast({ title: e instanceof Error ? e.message : 'فشل التحميل', tone: 'error' }),
        });
      }}
    >
      <Database className="h-4 w-4" /> تحميل بيانات العرض
    </Button>
  );
}

function ForceSeedDemoButton({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { toast } = useToast();
  const seed = useSeedDemo(projectId);
  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        disabled={seed.isPending}
        onClick={() => {
          seed.mutate(true, {
            onSuccess: (r) => {
              toast({
                title: r.seeded ? 'تمت إعادة التحميل' : 'لم يُضف جديد',
                message: seedMessage(r),
                tone: r.seeded ? 'success' : 'info',
              });
              onDone();
            },
            onError: (e) => toast({ title: e instanceof Error ? e.message : 'فشل التحميل', tone: 'error' }),
          });
        }}
      >
        <RotateCcw className="h-4 w-4" /> تأكيد إعادة التحميل
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>إلغاء</Button>
    </>
  );
}

function AttachDemoImagesButton({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const attach = useAttachDemoImages(projectId);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={attach.isPending}
      onClick={() => {
        attach.mutate(undefined, {
          onSuccess: (r) => {
            if (r.reason === 'source_missing') {
              toast({ title: 'مجلد الصور غير موجود', message: 'backend/demo_images/', tone: 'info' });
              return;
            }
            if (r.attached > 0) {
              toast({ title: 'تم ربط الصور', message: `${r.attached} تنبيه`, tone: 'success' });
            } else {
              toast({ title: 'لم تُطابق أي صورة', message: 'سمّ الملفات مثل MUN-712-001.jpg', tone: 'info' });
            }
          },
          onError: (e) => toast({ title: e instanceof Error ? e.message : 'فشل الربط', tone: 'error' }),
        });
      }}
    >
      <ImageIcon className="h-4 w-4" /> ربط الصور
    </Button>
  );
}
