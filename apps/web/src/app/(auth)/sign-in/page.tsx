'use client';
import { Button, Field, Input, useToast } from '@trackrex/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/shared/api/client';
import { useAuth, type Company } from '@/shared/auth/auth';

type Step = 'credentials' | 'otp' | 'company';

export default function SignInPage() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>('credentials');
  const [tenant, setTenant] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [companies, setCompanies] = useState<{ token: string; list: Company[] }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { setTenant(localStorage.getItem('trk.tenant') ?? ''); } catch { /* ignore */ } }, []);
  useEffect(() => { if (auth.status === 'authenticated') router.replace('/'); }, [auth.status, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); } finally { setBusy(false); }
  }
  const handle = (r: Awaited<ReturnType<typeof auth.signIn>>) => {
    if (r.status === 'choose_company') { setCompanies({ token: r.selectionToken, list: r.companies }); setStep('company'); }
  };

  const submitPassword = (e: FormEvent) => { e.preventDefault(); void run(async () => handle(await auth.signIn(identifier, password, tenant || undefined))); };
  const sendOtp = () => run(async () => { const r = await auth.requestOtp(identifier); setDevCode(r.devCode); setStep('otp'); toast('info', 'If that account exists, a code is on its way.'); });
  const submitOtp = (e: FormEvent) => { e.preventDefault(); void run(async () => handle(await auth.verifyOtp(identifier, code, tenant || undefined))); };

  if (step === 'company' && companies) {
    return (
      <div className="space-y-4">
        <h1 className="text-page font-semibold">Choose a company</h1>
        <p className="text-sm text-muted">You belong to more than one company. You can switch later from the profile menu.</p>
        <ul className="divide-y divide-rule border-y border-rule">
          {companies.list.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex min-h-14 w-full items-center justify-between px-1 text-left hover:bg-canvas" disabled={busy} onClick={() => run(async () => { await auth.selectCompany(companies.token, c.id); })}>
                <span><span className="block font-medium">{c.name}</span><span className="text-xs text-muted">{c.slug}</span></span>
                <span className="text-xs text-muted capitalize">{c.status.replace('_', ' ')}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Use the email or mobile number your company has on file.</p>
      </div>
      {step === 'credentials' ? (
        <form onSubmit={submitPassword} className="space-y-4" noValidate>
          <Field label="Company address" help="The part before .app in your Trackrex address. Leave empty if you only use one company.">
            {(id, d) => <Input id={id} aria-describedby={d} value={tenant} onChange={(e) => setTenant(e.target.value.trim().toLowerCase())} autoCapitalize="none" autoComplete="organization" placeholder="meridian-demo" />}
          </Field>
          <Field label="Email or mobile number" required>
            {(id) => <Input id={id} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" inputMode="email" required />}
          </Field>
          <Field label="Password" required error={error}>
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!identifier || !password}>Sign in</Button>
          <Button className="w-full" disabled={!identifier || busy} onClick={() => void sendOtp()}>Email me a one-time code instead</Button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4" noValidate>
          <p className="text-sm text-muted">We sent a 6-digit code to {identifier}. It works for 10 minutes.</p>
          {devCode && <p className="rounded-input bg-pending-tint px-3 py-2 text-xs">Development mode: your code is <span className="font-semibold tabular-nums">{devCode}</span></p>}
          <Field label="One-time code" required error={error}>
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="tabular-nums tracking-widest" required />}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.length !== 6}>Verify and sign in</Button>
          <Button className="w-full" onClick={() => { setStep('credentials'); setCode(''); setError(undefined); }}>Back</Button>
        </form>
      )}
      <p className="text-center text-sm text-muted">New to Trackrex? <Link href="/signup" className="font-medium">Start a 14-day trial</Link></p>
    </div>
  );
}
