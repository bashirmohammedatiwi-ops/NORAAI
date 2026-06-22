import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Upload, Loader2 } from 'lucide-react';

interface Props {
  projectId: string;
  classNames?: string[];
  onImported?: () => void;
}

const ROBOFLOW_PRESET = {
  name: 'Pothole-Manhole Roboflow v2',
  architecture: 'yolo11',
  variant: 'n',
  classes: 'Asfalt_zemin,Manhole,Parke_zemin,Pothole,Speedbreaker',
  source: 'roboflow',
  resizeMode: 'stretch',
} as const;

const YOLO12_PRESETS = [
  { architecture: 'yolo12', variant: 's', label: 'YOLO12s (RDD2022 / road damage)' },
  { architecture: 'yolo12', variant: 'n', label: 'YOLO12n (lighter, mobile)' },
  { architecture: 'yolo12', variant: 'm', label: 'YOLO12m (higher accuracy)' },
] as const;

const YOLO11_PRESETS = [
  { architecture: 'yolo11', variant: 'n', label: 'YOLO11n' },
  { architecture: 'yolo11', variant: 's', label: 'YOLO11s' },
  { architecture: 'yolo11', variant: 'n', label: 'YOLOv8n (Roboflow ONNX)' },
] as const;

type ImportKind = 'roboflow' | 'yolo12' | 'yolo11';

export function ModelImportCard({ projectId, classNames = [], onImported }: Props) {
  const ptRef = useRef<HTMLInputElement>(null);
  const onnxRef = useRef<HTMLInputElement>(null);
  const [importKind, setImportKind] = useState<ImportKind>('roboflow');
  const [name, setName] = useState<string>(ROBOFLOW_PRESET.name);
  const [variant, setVariant] = useState('n');
  const [classes, setClasses] = useState<string>(ROBOFLOW_PRESET.classes);
  const [promote, setPromote] = useState(true);
  const [loading, setLoading] = useState(false);

  const family = importKind === 'yolo12' ? 'yolo12' : 'yolo11';
  const presets = importKind === 'yolo12' ? YOLO12_PRESETS : YOLO11_PRESETS;
  const isRoboflow = importKind === 'roboflow';

  const applyKind = (kind: ImportKind) => {
    setImportKind(kind);
    if (kind === 'roboflow') {
      setName(ROBOFLOW_PRESET.name);
      setClasses(ROBOFLOW_PRESET.classes);
      setVariant('n');
    } else if (kind === 'yolo12') {
      setName('RDD YOLO12');
      setClasses('D00,D10,D20,D40,Repair');
      setVariant('s');
    } else {
      setName('Imported Model');
      setClasses(classNames.join(', ') || 'حوادث,حفر');
      setVariant('n');
    }
    if (ptRef.current) ptRef.current.value = '';
    if (onnxRef.current) onnxRef.current.value = '';
  };

  const importModel = async () => {
    const pt = ptRef.current?.files?.[0];
    const onnx = onnxRef.current?.files?.[0];
    if (isRoboflow && !onnx) {
      window.alert('اختر ملف ONNX (مثل pothole-manhole-2_v2.onnx)');
      return;
    }
    if (!isRoboflow && !pt) {
      window.alert('اختر ملف .pt');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      if (pt) fd.append('weights_file', pt);
      if (onnx) fd.append('onnx_file', onnx);
      fd.append('name', name);
      fd.append('architecture', family);
      fd.append('model_variant', variant);
      fd.append('classes', classes);
      fd.append('promote', String(promote));
      if (isRoboflow) {
        fd.append('source', ROBOFLOW_PRESET.source);
        fd.append('resize_mode', ROBOFLOW_PRESET.resizeMode);
      } else {
        fd.append('source', 'import');
        fd.append('resize_mode', 'letterbox');
      }
      await api.post(`/api/v1/models/project/${projectId}/import`, fd);
      onImported?.();
      window.alert('تم استيراد الموديل بنجاح');
      if (ptRef.current) ptRef.current.value = '';
      if (onnxRef.current) onnxRef.current.value = '';
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الاستيراد');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          استيراد موديل · Import Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Select
          label="نوع الاستيراد"
          value={importKind}
          onChange={(e) => applyKind(e.target.value as ImportKind)}
        >
          <option value="roboflow">Roboflow ONNX (Pothole-Manhole)</option>
          <option value="yolo12">YOLO12 RDD (.pt + ONNX)</option>
          <option value="yolo11">YOLO11 / Local Trainer (.pt)</option>
        </Select>

        {isRoboflow ? (
          <p className="text-muted-foreground text-xs">
            ارفع <code>pothole-manhole-2_v2.onnx</code> فقط. الكلاسات:
            Pothole=حفرة، Manhole=بالوعة، Speedbreaker=مطب
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            ارفع <code>.pt</code> واختياري <code>.onnx</code>. للـ RDD استخدم:
            D00,D10,D20,D40,Repair
          </p>
        )}

        {!isRoboflow && (
          <div>
            <label className="text-xs text-muted-foreground">Weights (.pt)</label>
            <input ref={ptRef} type="file" accept=".pt" className="mt-1 block w-full text-xs" />
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">
            ONNX {isRoboflow ? '(required)' : '(optional)'}
          </label>
          <input ref={onnxRef} type="file" accept=".onnx" className="mt-1 block w-full text-xs" />
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" />
        {!isRoboflow && (
          <>
            <Select
              label="YOLO family"
              value={family}
              onChange={(e) => {
                const next = e.target.value as 'yolo11' | 'yolo12';
                setImportKind(next);
                setVariant(next === 'yolo12' ? 's' : 'n');
              }}
            >
              <option value="yolo12">YOLO12 (RDD2022, external weights)</option>
              <option value="yolo11">YOLO11</option>
            </Select>
            <Select label="Variant" value={variant} onChange={(e) => setVariant(e.target.value)}>
              {presets.map((p) => (
                <option key={`${p.architecture}-${p.variant}-${p.label}`} value={p.variant}>
                  {p.label}
                </option>
              ))}
            </Select>
          </>
        )}
        <Input
          value={classes}
          onChange={(e) => setClasses(e.target.value)}
          placeholder="Classes comma-separated"
        />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={promote} onChange={(e) => setPromote(e.target.checked)} />
          تفعيل كنموذج إنتاج (Main Model)
        </label>
        <Button onClick={importModel} disabled={loading} variant="outline" className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          استيراد
        </Button>
      </CardContent>
    </Card>
  );
}
