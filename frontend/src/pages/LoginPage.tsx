import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Images, Sparkles, Shield, Zap } from 'lucide-react';

const features = [
  { icon: Sparkles, title: 'Simple workflow', desc: 'Upload images, assign classes, train YOLO in minutes.' },
  { icon: Images, title: 'Visual datasets', desc: 'Browse images with labels and bounding boxes.' },
  { icon: Zap, title: 'One-click training', desc: 'Quick Train or advanced configuration.' },
  { icon: Shield, title: 'Production ready', desc: 'Deploy models and monitor performance.' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('admin@aiops.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ access_token: string }>('/api/v1/auth/login', { email, password });
      api.setToken(res.access_token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary/10 via-blue-50 to-background p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-card">
            <Images className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">NORAAI</h1>
            <p className="text-sm text-muted-foreground">Smart Road AI Platform</p>
          </div>
        </div>

        <div className="space-y-6 max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-foreground">
            Build, train, and deploy road intelligence models — easily.
          </h2>
          <div className="grid gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3 rounded-xl bg-card/70 border border-border/60 p-4 shadow-soft">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">© NORAAI · MLOps for smart infrastructure</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md shadow-elevated border-border/60">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary lg:hidden">
              <Images className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your AI Operations Center</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" placeholder="admin@aiops.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
