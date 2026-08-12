import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME, APP_REGION, APP_TAGLINE } from '@/lib/constants';
import { initTheme } from '@/lib/theme';
import { MonitorPlay, Shield, Zap } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { initTheme(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.post<{ access_token: string; refresh_token: string }>(
        '/api/v1/auth/login',
        { username: email.trim(), password },
      );
      api.setSession(data.access_token, data.refresh_token);
      api.clearProjectId();
      try {
        const me = await api.get<{ default_project_id?: string | null }>('/api/v1/auth/me');
        if (me.default_project_id) api.setProjectId(me.default_project_id);
      } catch {
        /* project will resolve from /projects in AppLayout */
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-teal-700 to-teal-900 p-12 text-white lg:flex">
        <div>
          <div className="iraq-strip mb-8 rounded-full opacity-90" style={{ height: 4 }} />
          <h1 className="text-4xl font-black">{APP_NAME}</h1>
          <p className="mt-2 text-teal-100">{APP_REGION}</p>
          <p className="mt-6 max-w-md text-lg text-teal-50/90">{APP_TAGLINE}</p>
        </div>
        <ul className="space-y-4 text-sm text-teal-100">
          <li className="flex items-center gap-2"><MonitorPlay className="h-4 w-4" /> مركز عمليات بخريطة حية</li>
          <li className="flex items-center gap-2"><Shield className="h-4 w-4" /> 18 محافظة · تنبيهات مصنّفة</li>
          <li className="flex items-center gap-2"><Zap className="h-4 w-4" /> AI Lab · WebSocket · صحة النظام</li>
        </ul>
        <p className="text-xs text-teal-200/70">لوحة التحكم v4 — منصة متكاملة</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md shadow-lg">
          <div className="iraq-strip rounded-t-xl" />
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-2xl font-black text-white shadow-md">ر</div>
            <CardTitle className="text-xl">تسجيل الدخول</CardTitle>
            <p className="text-sm text-muted-foreground">مركز عمليات راصد — v4</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">البريد</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" autoComplete="username" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">كلمة المرور</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" autoComplete="current-password" />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'جاري الدخول...' : 'دخول لوحة التحكم'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
