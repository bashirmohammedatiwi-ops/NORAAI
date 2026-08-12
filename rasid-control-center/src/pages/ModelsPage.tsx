import { useRef, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QueryState } from '@/components/shared/QueryState';
import { useImportModel, useModels, usePromoteModel, useRoadStats } from '@/hooks/useControlCenter';
import { useControlContext } from '@/context/ControlContext';
import { useToast } from '@/context/ToastContext';
import { Upload, Brain, CheckCircle2, Cpu, Smartphone, Zap } from 'lucide-react';

export default function ModelsPage() {
  const { projectId } = useControlContext();
  const { data: models = [], isLoading, isError, error, refetch } = useModels(projectId);
  const { data: roadStats } = useRoadStats(projectId);
  const importModel = useImportModel(projectId);
  const promoteModel = usePromoteModel(projectId);
  const { toast } = useToast();
  const ptRef = useRef<HTMLInputElement>(null);
  const onnxRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('Rasid Iraq Edge Model');
  const [progress, setProgress] = useState('');

  async function handleUpload() {
    const pt = ptRef.current?.files?.[0];
    const onnx = onnxRef.current?.files?.[0];
    if (!pt && !onnx) { setProgress('ارفع ملف .pt أو .onnx'); return; }
    const form = new FormData();
    form.append('name', name);
    form.append('architecture', 'yolo11');
    form.append('model_variant', 's');
    form.append('promote', 'true');
    form.append('source', 'control-center-iraq');
    if (pt) form.append('weights_file', pt);
    if (onnx) form.append('onnx_file', onnx);
    setProgress('جاري الرفع...');
    try {
      await importModel.mutateAsync(form);
      setProgress('تم — النموذج مفعّل على أجهزة الأسطول');
      refetch();
    } catch (e) {
      setProgress(e instanceof Error ? e.message : 'فشل الرفع');
    }
  }

  function handlePromote(modelId: string, modelName: string) {
    promoteModel.mutate(modelId, {
      onSuccess: () => {
        toast({ title: 'تم تفعيل النموذج', message: modelName, tone: 'success' });
        refetch();
      },
      onError: (e) => toast({ title: e instanceof Error ? e.message : 'فشل التفعيل', tone: 'error' }),
    });
  }

  const active = models.find((m) => m.is_active);
  const edgeModel = roadStats?.active_model;

  return (
    <div className="page-shell">
      <TopBar title="نماذج الذكاء الاصطناعي" subtitle="رفع · تحديث · نشر على أجهزة راصد في العراق" />

      <div className="page-body">
        <QueryState isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()}>
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-1 ring-1 ring-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />النموذج النشط</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {active ? (
                <>
                  <p className="text-lg font-bold">{active.name}</p>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> مفعّل
                  </Badge>
                  <p className="text-sm text-muted-foreground">{active.architecture} · {active.lifecycle}</p>
                  {edgeModel?.ready && (
                    <p className="text-xs text-muted-foreground">Edge: {edgeModel.name} ({edgeModel.architecture})</p>
                  )}
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />Edge GPU</span>
                    <span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" />ONNX</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">لا نموذج نشط — ارفع نموذجاً أو فعّل واحداً من القائمة</p>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />رفع / تحديث</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم النموذج</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">PyTorch (.pt)</label>
                <Input ref={ptRef} type="file" accept=".pt" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">ONNX للأجهزة</label>
                <Input ref={onnxRef} type="file" accept=".onnx" />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={handleUpload} disabled={importModel.isPending}>
                  <Upload className="h-4 w-4" /> رفع وتفعيل للأسطول
                </Button>
                {progress && <p className="mt-2 text-sm text-muted-foreground">{progress}</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <h2 className="font-bold">جميع النماذج ({models.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-2 p-4">
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.architecture} · {m.lifecycle}</p>
                <div className="flex flex-wrap gap-2">
                  {m.is_active ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">نشط</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={promoteModel.isPending}
                      onClick={() => handlePromote(m.id, m.name)}
                    >
                      <Zap className="h-3.5 w-3.5" /> تفعيل
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </QueryState>
      </div>
    </div>
  );
}
