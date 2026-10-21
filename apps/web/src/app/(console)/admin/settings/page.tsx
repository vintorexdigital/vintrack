'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Field, Input, PageBody, PageHeader, Select, Skeleton, Toggle, cn, useToast } from '@trackrex/ui';
import { RotateCcw, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import type { SettingDef } from '@trackrex/schemas';
import { api, ApiError } from '@/shared/api/client';
import { useCan } from '@/shared/auth/auth';

interface Payload { definitions: SettingDef[]; values: Record<string, unknown> }

/** One generic renderer for the whole settings registry: grouped by intent, searchable, with "changed from default" markers. */
function SettingsInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const canEdit = useCan('company.settings.update');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Payload>('/v1/settings') });
  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) => api(`/v1/settings/${v.key}`, { method: 'PUT', body: { value: v.value } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not save that setting.'),
  });
  const reset = useMutation({ mutationFn: (key: string) => api(`/v1/settings/${key}`, { method: 'DELETE' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }) });

  const defs = q.data?.definitions ?? [];
  const sections = [...new Set(defs.map((d) => d.section))];
  const section = sp.get('section') && sections.includes(sp.get('section')!) ? sp.get('section')! : sections[0] ?? '';
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => defs.filter((d) => (needle ? `${d.label} ${d.description} ${d.key}`.toLowerCase().includes(needle) : d.section === section)), [defs, needle, section]);
  const groups = [...new Set(visible.map((d) => (needle ? `${d.section} · ${d.group}` : d.group)))];
  const values = q.data?.values ?? {};
  const changedCount = (s: string) => defs.filter((d) => d.section === s && d.key in values).length;

  const control = (d: SettingDef) => {
    const v = d.key in values ? values[d.key] : d.default;
    const set = (x: unknown) => save.mutate({ key: d.key, value: x });
    const disabled = !canEdit;
    if (d.type === 'boolean') return <Toggle label={d.label} help={d.description} checked={!!v} onChange={set} disabled={disabled} />;
    return (
      <Field label={d.label} help={d.description}>
        {(id, desc) => {
          if (d.type === 'select') return <Select id={id} aria-describedby={desc} disabled={disabled} className="max-w-72" value={String(v)} onChange={(e) => set(e.target.value)}>{d.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
          if (d.type === 'number') return <Input id={id} aria-describedby={desc} disabled={disabled} type="number" min={d.min} max={d.max} className="max-w-40 tabular-nums" defaultValue={String(v)} onBlur={(e) => e.target.value !== String(v) && e.target.value !== '' && set(Number(e.target.value))} />;
          if (d.type === 'multiselect') {
            const cur = (v as string[]) ?? [];
            return <div className="flex flex-wrap gap-x-4 gap-y-1">{d.options?.map((o) => <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} className="size-4 accent-[var(--brand-primary)]" checked={cur.includes(o.value)} onChange={(e) => set(e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} />{o.label}</label>)}</div>;
          }
          return <Input id={id} aria-describedby={desc} disabled={disabled} className="max-w-md" defaultValue={String(v ?? '')} onBlur={(e) => e.target.value !== String(v ?? '') && set(e.target.value)} />;
        }}
      </Field>
    );
  };

  return (
    <>
      <PageHeader title="Settings" scope="Admin" description="Every change is audited. Settings you have changed from the default are marked." />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Search settings" placeholder="Search settings" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <ul className="hidden space-y-0.5 lg:block">{sections.map((s) => <li key={s}><button type="button" aria-current={!needle && s === section ? 'page' : undefined} onClick={() => { setSearch(''); router.replace(`/admin/settings?section=${encodeURIComponent(s)}`); }} className={cn('flex min-h-9 w-full items-center justify-between rounded-input px-2 text-left text-sm hover:bg-soft', !needle && s === section && 'bg-soft font-semibold text-brand')}>{s}{changedCount(s) > 0 && <span className="rounded-pill bg-live px-1.5 text-xs font-semibold text-on-live tabular-nums" title="Changed from default">{changedCount(s)}</span>}</button></li>)}</ul>
            <Select aria-label="Section" className="lg:hidden" value={section} onChange={(e) => router.replace(`/admin/settings?section=${encodeURIComponent(e.target.value)}`)}>{sections.map((s) => <option key={s}>{s}</option>)}</Select>
          </div>
          <div className="min-w-0 max-w-3xl">
            {q.isLoading ? <Skeleton className="h-64" /> : visible.length === 0 ? <EmptyState title="No settings match" hint="Try a different word." /> : groups.map((g) => (
              <section key={g} className="border-t border-rule py-4 first:border-t-0 first:pt-0">
                <h2 className="mb-3 text-section font-semibold">{g}</h2>
                <div className="space-y-4">
                  {visible.filter((d) => (needle ? `${d.section} · ${d.group}` : d.group) === g).map((d) => (
                    <div key={d.key} className={cn('flex items-start gap-3', d.key in values && 'border-l-2 border-live pl-3')}>
                      <div className="min-w-0 flex-1">{control(d)}</div>
                      {d.key in values && canEdit && <Button size="sm" variant="ghost" aria-label={`Reset ${d.label} to default`} title="Reset to default" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => reset.mutate(d.key)} />}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsInner /></Suspense>;
}
