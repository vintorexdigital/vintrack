'use client';
import { Button, EmptyState, Field, Input, Skeleton } from '@trackrex/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

interface Preview { company: { name: string; slug: string }; email: string | null; mobile: string | null; name: string | null; hasAccount: boolean }

function AcceptInvite() {
  const token = useSearchParams().get('token') ?? '';
  const auth = useAuth();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | 'missing'>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>('/v1/auth/invitations/preview', { query: { token } }).then((p) => { setPreview(p); setName(p.name ?? ''); }).catch(() => setPreview('missing'));
  }, [token]);
  useEffect(() => { if (auth.status === 'authenticated') router.replace('/'); }, [auth.status, router]);

  if (preview === null) return <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  if (preview === 'missing') return <EmptyState title="This invitation is no longer valid" hint="It may have expired or been used already. Ask your admin to send a new one." />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined); setFieldErrors({});
    try { await auth.acceptInvitation({ token, name, password }); } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFieldErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message]))); } else setError('Something went wrong. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-page font-semibold">Join {preview.company.name}</h1>
        <p className="text-sm text-muted">{preview.hasAccount ? 'Enter your existing Trackrex password to accept.' : 'Choose a password to finish setting up your account.'}</p>
      </div>
      <p className="rounded-input bg-soft px-3 py-2 text-sm">{preview.email ?? preview.mobile}</p>
      {!preview.hasAccount && <Field label="Your name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}</Field>}
      <Field label={preview.hasAccount ? 'Password' : 'Create a password'} required help={preview.hasAccount ? undefined : 'At least 10 characters with upper and lower case letters and a number.'} error={fieldErrors.password ?? error}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!(fieldErrors.password ?? error)} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={preview.hasAccount ? 'current-password' : 'new-password'} required />}
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!password || (!preview.hasAccount && !name)}>Accept invitation</Button>
    </form>
  );
}

export default function Page() {
  return <Suspense><AcceptInvite /></Suspense>;
}
