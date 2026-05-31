import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete permanently',
  loading = false,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    setError('');
    try {
      await onConfirm(password);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {title}
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Enter your password to confirm</label>
            <Input
              type="password"
              placeholder="Your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
              {loading ? 'Deleting...' : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
