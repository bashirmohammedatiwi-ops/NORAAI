import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QueryStateProps {
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  loadingLabel?: string;
  children: ReactNode;
  skeleton?: ReactNode;
}

export function QueryState({
  isLoading,
  isError,
  error,
  onRetry,
  loadingLabel = 'جاري التحميل...',
  children,
  skeleton,
}: QueryStateProps) {
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-6 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="font-semibold text-red-800">تعذّر تحميل البيانات</p>
        <p className="max-w-md text-sm text-red-700">{error?.message ?? 'تحقق من الاتصال بالخادم'}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return skeleton ?? <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  }

  return <>{children}</>;
}

export function ChartEmpty({ message = 'لا بيانات بعد — حمّل بيانات العرض من الإعدادات' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
