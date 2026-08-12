import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Control Center error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="surface-elevated max-w-md p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="mt-4 text-lg font-bold">حدث خطأ غير متوقع</h2>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
            <Button className="mt-6" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
              <RefreshCw className="h-4 w-4" /> إعادة تحميل
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
