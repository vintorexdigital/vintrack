'use client';
import { BrandMark, Button, Field, Input, Wordmark } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/shared/api';
import { useSession, type LoginStep } from '@/shared/session';

export default function SignIn() {
  const s = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<LoginStep | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.status === 'authenticated') router.replace('/'); }, [s.status, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined);
    try {
      if (step?.status === 'totp_setup') await s.enroll(step.setupToken, code);
      else {
        const r = await s.login(email, password, step?.status === 'totp_required' ? code : undefined);
        if (r.status !== 'ok') { setStep(r); setCode(''); }
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); } finally { setBusy(false); }
  }

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4" noValidate>
        <div><p className="mb-4 flex items-center gap-2.5"><BrandMark className="size-10" /><Wordmark tagline className="text-2xl" /><span className="self-start pt-1 text-sm font-semibold text-muted">Platform</span></p><h1 className="text-page font-semibold">Operator sign-in</h1><p className="text-sm text-muted">Vintorex staff only. Two-factor verification is required.</p></div>
        {!step && <>
          <Field label="Work email" required>{(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
          <Field label="Password" required error={error}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        </>}
        {step?.status === 'totp_setup' && (
          <div className="space-y-3 rounded-overlay border border-rule bg-surface p-3 text-sm">
            <p className="font-semibold">Set up two-factor verification</p>
            <p>Add this key to an authenticator app (or open the link on your phone), then enter the 6-digit code it shows.</p>
            <p className="break-all rounded-input bg-soft px-2 py-1.5 font-mono text-xs" data-testid="totp-secret">{step.secret}</p>
            <a href={step.otpauthUri}>Open in authenticator app</a>
          </div>
        )}
        {step && <Field label="6-digit code" required error={error}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error} inputMode="numeric" autoComplete="one-time-code" className="tabular-nums tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />}</Field>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!step ? !email || !password : code.length !== 6}>{step ? 'Verify' : 'Continue'}</Button>
      </form>
    </main>
  );
}
