import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}

export function DatasetLoadError({ message, onRetry, retrying }: Props) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center space-y-3">
      <AlertCircle className="h-8 w-8 mx-auto text-destructive/80" />
      <p className="text-sm text-muted-foreground">
        {message ?? 'Failed to load datasets. Your data is still saved — try again.'}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} /> Retry
      </Button>
    </div>
  );
}
