import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const HEALTH_ATTEMPTS = 30;
const HEALTH_INTERVAL_MS = 5000;
const HEALTH_TIMEOUT_MS = 8000;

function isConnectionError(message: string): boolean {
  return (
    message.includes('timed out')
    || message.includes('unreachable')
    || message.includes('Failed to fetch')
    || message.includes('NetworkError')
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api.clearToken();
    let cancelled = false;
    let attempt = 0;

    const checkHealth = async () => {
      attempt += 1;
      if (!cancelled) setBootAttempt(attempt);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const res = await fetch('/health', { signal: controller.signal });
        clearTimeout(timer);
        if (cancelled) return;
        if (res.ok) {
          setApiReady(true);
          return;
        }
      } catch {
        /* retry */
      }

      if (cancelled) return;
      if (attempt >= HEALTH_ATTEMPTS) {
        setApiReady(false);
        return;
      }
      window.setTimeout(checkHealth, HEALTH_INTERVAL_MS);
    };

    setApiReady(null);
    checkHealth();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login<{ access_token: string; refresh_token: string }>(username, password);
      api.setSession(res.access_token, res.refresh_token);
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      if (message.includes('Invalid credentials')) {
        setError('Invalid email or password.');
      } else if (isConnectionError(message)) {
        setError('Cannot reach the server. The API may still be starting after a VPS reboot — wait 2–3 minutes and try again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const starting = apiReady === null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">NURAI</h1>
        </div>

        {starting && (
          <p className="text-sm text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2 text-center">
            Starting server… ({bootAttempt}/{HEALTH_ATTEMPTS})
          </p>
        )}

        {apiReady === false && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            Server unreachable on port 8080. On the VPS run: <code className="text-xs">sudo ./scripts/ensure_services.sh recover</code>
          </p>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || starting}>
            {loading ? 'Signing in...' : starting ? 'Waiting for server…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
