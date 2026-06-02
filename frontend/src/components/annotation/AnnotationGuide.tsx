import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Keyboard } from 'lucide-react';

interface Props {
  projectId: string;
}

export function AnnotationGuide({ projectId }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-blue-500/25 bg-blue-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-800 dark:text-blue-200">حوادث</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>ارسم صندوقاً حول <strong>المركبة بالكامل</strong> — ليس جزءاً منها فقط.</p>
          <p>صورة بها حادث → صنف <strong>حوادث</strong>. صورة سليمة → لا صندوق (أو ارفعها كخلفية من البيانات).</p>
        </CardContent>
      </Card>

      <Card className="border-orange-500/25 bg-orange-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-orange-800 dark:text-orange-200">حفر</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>ارسم صندوقاً على <strong>الحفرة أو العيب</strong> في الإسفلت.</p>
          <p>صورة للطريق فقط → صنف <strong>حفر</strong>.</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">اختصارات لوحة المفاتيح</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            {[
              ['D', 'وضع الرسم'],
              ['V', 'تحديد / نقل'],
              ['Del', 'حذف الصندوق'],
              ['← / →', 'الصورة السابقة / التالية'],
            ].map(([key, desc]) => (
              <div key={key} className="flex gap-2">
                <dt className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded shrink-0">{key}</dt>
                <dd className="text-muted-foreground">{desc}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground mt-3">
            يُحفظ كل تغيير تلقائياً عند رسم صندوق أو تعديله أو حذفه.
          </p>
        </CardContent>
      </Card>

      <p className="lg:col-span-2 text-xs text-muted-foreground">
        تحتاج صوراً جديدة؟{' '}
        <Link to={`/projects/${projectId}/data`} className="text-primary underline">
          مركز البيانات
        </Link>
        {' '}→ ثم ارجع هنا للتسمية → Retrain من التدريب.
      </p>
    </div>
  );
}
