import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, login, register } from '../lib/api';
import { Card, ErrorBox, Field, InfoBox, btnPrimary, inputCls } from '../components/ui';

export default function AuthPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialMode = params.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email: email.trim(), password });
        nav('/', { replace: true });
      } else {
        await register({ email: email.trim(), password, name: name.trim() });
        setInfo('Registered. You can now log in (email verification may be required by the server).');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto grid min-h-[calc(100vh-61px)] max-w-6xl items-center gap-10 p-4 sm:p-8 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:block">
        <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
          Tshirt Studio
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,5.5vw,5rem)] font-light leading-[1.02] tracking-[-0.01em] text-champagne">
          Crafted on lacquer,
          <br />
          finished in <span className="text-gold">gold.</span>
        </h1>
        <p className="mt-6 max-w-[42ch] text-[15px] leading-relaxed text-muted">
          Design garments in 3D, place artwork per zone, and move from draft to quoted
          to confirmed — one quiet, precise workflow.
        </p>
      </div>

      {/* Auth card */}
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 lg:hidden">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-light text-champagne">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
        </div>
        <Card className="p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-[6px] border border-rule bg-lacquer-deep p-1" role="tablist" aria-label="Auth mode">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-[44px] rounded-[4px] text-sm font-semibold capitalize transition-colors ${
                  mode === m ? 'bg-graphite2 text-gold' : 'text-muted hover:text-champagne'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'register' ? (
              <Field label="Name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              </Field>
            ) : null}
            <Field label="Email">
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
            </Field>
            <Field label="Password">
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            <ErrorBox message={error} onDismiss={() => setError(null)} />
            <InfoBox message={info} />
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-faint">
            Admin accounts must already exist server-side (role column). After login the role is read
            from the JWT role claim; it defaults to customer.
          </p>
        </Card>
      </div>
    </section>
  );
}
