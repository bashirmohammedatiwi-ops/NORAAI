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

export function ModelImportCard({ projectId, classNames = [], onImported }: Props) {
  const ptRef = useRef<HTMLInputElement>(null);
  const onnxRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('Imported Model');
  const [variant, setVariant] = useState('n');
  const [classes, setClasses] = useState(classNames.join(', '));
  const [promote, setPromote] = useState(true);
  const [loading, setLoading] = useState(false);

  const importModel = async () => {
    const pt = ptRef.current?.files?.[0];
    if (!pt) {
      window.alert('اختر ملف .pt');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('weights_file', pt);
      fd.append('name', name);
      fd.append('architecture', 'yolo11');
      fd.append('model_variant', variant);
      fd.append('classes', classes);
      fd.append('promote', String(promote));
      const onnx = onnxRef.current?.files?.[0];
      if (onnx) fd.append('onnx_file', onnx);
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
        <p className="text-muted-foreground text-xs">
          ارفع <code>.pt</code> من Local Trainer أو أي تدريب YOLO خارجي. اختياري: <code>.onnx</code>
        </p>
        <div>
          <label className="text-xs text-muted-foreground">Weights (.pt)</label>
          <input ref={ptRef} type="file" accept=".pt" className="mt-1 block w-full text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">ONNX (optional)</label>
          <input ref={onnxRef} type="file" accept=".onnx" className="mt-1 block w-full text-xs" />
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" />
        <Select value={variant} onChange={(e) => setVariant(e.target.value)}>
          <option value="n">YOLO11n</option>
          <option value="s">YOLO11s</option>
        </Select>
        <Input
          value={classes}
          onChange={(e) => setClasses(e.target.value)}
          placeholder="Classes: pothole, crack, accident"
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
