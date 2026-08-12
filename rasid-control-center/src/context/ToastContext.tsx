import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; message?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

const toneIcon: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((input: { title: string; message?: string; tone?: ToastTone }) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev.slice(-4), { id, title: input.title, message: input.message, tone: input.tone ?? 'info' }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:left-auto sm:right-4 sm:px-0">
        {items.map((t) => {
          const Icon = toneIcon[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto animate-slide-up rounded-xl border p-4 shadow-lg backdrop-blur',
                toneStyles[t.tone],
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  {t.message && <p className="mt-0.5 text-sm opacity-90">{t.message}</p>}
                </div>
                <button type="button" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} className="rounded p-1 opacity-60 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}
