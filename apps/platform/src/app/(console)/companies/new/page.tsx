'use client';
import { useMutation } from '@tanstack/react-query';
import { Banner, Button, Field, Input, PageBody, PageHeader, Select } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/shared/api';

export default function NewCompany() {
  const router = useRouter();
  const [v, setV] = useState({ name: '', slug: '', country: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', planKey: 'trial', trialDays: '14', seatLimit: '10', ownerName: '', ownerEmail: '', ownerPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [made, setMade] = useState<{ id: string; token?: string }>();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value, ...(k === 'name' && !x.slug ? { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) } : {}) }));
  const create = useMutation({
    mutationFn: () => api<{ tenant: { id: string }; devInviteToken?: string }>('/platform/v1/tenants', { method: 'POST', body: { name: v.name, slug: v.slug, country: v.country, timezone: v.timezone, currency: v.currency, planKey: v.planKey, trialDays: Number(v.trialDays), seatLimit: Number(v.seatLimit), owner: { name: v.ownerName, email: v.ownerEmail, ...(v.ownerPassword ? { password: v.ownerPassword } : {}) } } }),
    onSuccess: (r) => setMade({ id: r.tenant.id, ...(r.devInviteToken ? { token: r.devInviteToken } : {}) }),
    onError: (e) => { if (e instanceof ApiError) setErrors({ form: e.message, ...Object.fromEntries(e.errors.map((x) => [x.path, x.message])) }); },
  });
  if (made) return (
    <><PageHeader title="Company provisioned" scope="Platform · Companies" /><PageBody wide={false} className="space-y-4">
      <Banner tone="info">Defaults were seeded: roles, a shift, break types, leave types and holidays. {v.ownerPassword ? 'The owner can sign in now.' : 'The owner received an email invitation to set a password.'}</Banner>
      {made.token && <p className="rounded-input bg-soft px-3 py-2 text-xs">Development: invitation token <span className="font-mono">{made.token}</span></p>}
      <Button variant="primary" onClick={() => router.push(`/companies/${made.id}`)}>Open company</Button></PageBody></>
  );
  return (
    <>
      <PageHeader title="Provision company" scope="Platform · Companies" description="Creates the company, reserves its address, invites the owner and seeds defaults." />
      <PageBody wide={false}>
        <form className="grid gap-4 lg:grid-cols-2" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); setErrors({}); create.mutate(); }}>
          <Field label="Company name" required error={errors.name}>{(id) => <Input id={id} value={v.name} onChange={set('name')} />}</Field>
          <Field label="Company address" required help="Becomes <address>.app.trackrex.app" error={errors.slug}>{(id, d) => <Input id={id} aria-describedby={d} value={v.slug} onChange={set('slug')} autoCapitalize="none" />}</Field>
          <Field label="Country">{(id) => <Input id={id} value={v.country} maxLength={2} onChange={set('country')} />}</Field>
          <Field label="Timezone">{(id) => <Input id={id} value={v.timezone} onChange={set('timezone')} />}</Field>
          <Field label="Currency">{(id) => <Input id={id} value={v.currency} maxLength={3} onChange={set('currency')} />}</Field>
          <Field label="Plan">{(id) => <Select id={id} value={v.planKey} onChange={set('planKey')}><option value="trial">Trial</option><option value="all_in_one">All in one</option><option value="field">Field bundle</option><option value="office">Office bundle</option></Select>}</Field>
          <Field label="Trial days">{(id) => <Input id={id} type="number" min={0} max={90} value={v.trialDays} onChange={set('trialDays')} />}</Field>
          <Field label="Seats">{(id) => <Input id={id} type="number" min={1} value={v.seatLimit} onChange={set('seatLimit')} />}</Field>
          <fieldset className="grid gap-4 lg:col-span-2 lg:grid-cols-3"><legend className="mb-2 text-section font-semibold">Owner</legend>
            <Field label="Name" required error={errors['owner.name']}>{(id) => <Input id={id} value={v.ownerName} onChange={set('ownerName')} />}</Field>
            <Field label="Email" required error={errors['owner.email']}>{(id) => <Input id={id} type="email" value={v.ownerEmail} onChange={set('ownerEmail')} />}</Field>
            <Field label="Password" help="Leave empty to email an invitation." error={errors['owner.password']}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={v.ownerPassword} onChange={set('ownerPassword')} />}</Field>
          </fieldset>
          {errors.form && !errors.slug && <p role="alert" className="text-sm text-absent lg:col-span-2">{errors.form}</p>}
          <div className="flex gap-2 lg:col-span-2"><Button onClick={() => router.push('/companies')}>Cancel</Button><Button type="submit" variant="primary" loading={create.isPending} disabled={!v.name || !v.slug || !v.ownerName || !v.ownerEmail}>Provision company</Button></div>
        </form>
      </PageBody>
    </>
  );
}
