import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSeedDemo } from '@/hooks/useControlCenter';
import { useToast } from '@/context/ToastContext';

interface DemoOnboardingBannerProps {
  projectId: string;
  alertsCount?: number;
  fleetCount?: number;
  /** Show until fleet loaded (Fleet page) */
  mode?: 'all' | 'fleet';
}

export function DemoOnboardingBanner({ projectId, alertsCount = 0, fleetCount = 0, mode = 'all' }: DemoOnboardingBannerProps) {
  const seed = useSeedDemo(projectId);
  const { toast } = useToast();

  const ready = mode === 'fleet' ? fleetCount > 0 : alertsCount > 0 || fleetCount > 0;
  if (ready) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold text-foreground">ابدأ ببيانات العرض</p>
            <p className="mt-1 text-sm text-muted-foreground">
              11 مطب · 3 حفر · 6 بالوعات · 10 مركبات — جاهزة للعرض التوضيحي
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={seed.isPending}
            onClick={() => {
              seed.mutate(false, {
                onSuccess: (r) => {
                  toast({
                    title: r.seeded ? 'تم تحميل بيانات العرض' : 'البيانات موجودة',
                    message: r.seeded ? `${r.alerts ?? 22} تنبيه · ${r.vehicles ?? 10} مركبة` : undefined,
                    tone: r.seeded ? 'success' : 'info',
                  });
                },
                onError: (e) => toast({ title: e instanceof Error ? e.message : 'فشل التحميل', tone: 'error' }),
              });
            }}
          >
            <Database className="h-4 w-4" /> تحميل الآن
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
