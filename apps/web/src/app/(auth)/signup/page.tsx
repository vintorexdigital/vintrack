'use client';
import { Button, Field, Input } from '@trackrex/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/shared/api/client';

export default function SignupPage() {
  const [v, setV] = useState({ name: '', slug: '', ownerName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ slug: string; devInviteToken?: string }>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value, ...(k === 'name' && !x.slug ? { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) } : {}) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const r = await api<{ company: { slug: string }; devInviteToken?: string }>('/v1/signup', { method: 'POST', body: { name: v.name, slug: v.slug, owner: { name: v.ownerName, email: v.email, password: v.password } } });
      setDone({ slug: r.company.slug, ...(r.devInviteToken ? { devInviteToken: r.devInviteToken } : {}) });
    } catch (err) {
      if (err instanceof ApiError) setErrors({ form: err.message, ...Object.fromEntries(err.errors.map((x) => [x.path, x.message])) });
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <h1 className="text-page font-semibold">Your workspace is ready</h1>
        <p className="text-sm text-muted">Your 14-day trial of every module has started. Sign in with the company address <span className="font-medium text-ink">{done.slug}</span>.</p>
        <Link href="/sign-in" className="inline-flex min-h-11 w-full items-center justify-center rounded-button bg-brand font-medium text-on-brand">Go to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-page font-semibold">Start your free trial</h1>
        <p className="text-sm text-muted">14 days, every module, 10 seats. No card needed.</p>
      </div>
      <Field label="Company name" required error={errors.name}>{(id) => <Input id={id} value={v.name} onChange={set('name')} autoComplete="organization" required />}</Field>
      <Field label="Company address" required help="Your team signs in at this address." error={errors.slug}>{(id, d) => <Input id={id} aria-describedby={d} value={v.slug} onChange={set('slug')} autoCapitalize="none" required />}</Field>
      <Field label="Your name" required error={errors['owner.name']}>{(id) => <Input id={id} value={v.ownerName} onChange={set('ownerName')} autoComplete="name" required />}</Field>
      <Field label="Work email" required error={errors['owner.email']}>{(id) => <Input id={id} type="email" value={v.email} onChange={set('email')} autoComplete="email" required />}</Field>
      <Field label="Password" required help="At least 10 characters with upper and lower case letters and a number." error={errors['owner.password']}>{(id, d) => <Input id={id} aria-describedby={d} type="password" value={v.password} onChange={set('password')} autoComplete="new-password" required />}</Field>
      {errors.form && !errors.slug && <p role="alert" className="text-sm text-absent">{errors.form}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={busy}>Create workspace</Button>
      <p className="text-center text-sm text-muted">Already have an account? <Link href="/sign-in" className="font-medium">Sign in</Link></p>
    </form>
  );
}
