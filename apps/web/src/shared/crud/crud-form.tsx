'use client';
import { Button, EmptyState, PageBody, PageHeader, Skeleton, useToast } from '@trackrex/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth';
import { FieldInput } from './fields';
import { titleOf, type Resource, type Row } from './resource';
import { useCrudResource } from './use-crud';

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0 && false);

/** Empty strings mean "not set": omitted on create, null on update so a cleared field is cleared on the server. */
function clean(values: Record<string, unknown>, mode: 'create' | 'update'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (isEmpty(v)) { if (mode === 'update') out[k] = null; continue; }
    out[k] = v;
  }
  return out;
}

export interface FormBodyProps {
  resource: Resource;
  row?: Row;
  onSaved?: (row: Row) => void;
  onCancel?: () => void;
}

/** Fields come from the entity definition, grouped by section; validation uses the same schema as the API. */
export function CrudFormBody({ resource: r, row, onSaved, onCancel }: FormBodyProps) {
  const toast = useToast();
  const { can, me } = useAuth();
  const sp = useSearchParams();
  const crud = useCrudResource(r);
  const create = crud.useCreate();
  const update = crud.useUpdate(row?.id ?? '');
  const mode = row ? 'update' : 'create';
  const fields = r.kit.formFields.filter((f) => !r.hiddenFields?.includes(f.key));
  const initial = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of fields) {
      // New records can be prefilled from the URL (?date=...) and default employee fields to the viewer.
      const fromUrl = sp.get(f.key) ?? undefined;
      const self = f.key === 'employeeId' && me?.membership.employeeId ? me.membership.employeeId : undefined;
      v[f.key] = row ? row[f.key] ?? undefined : fromUrl ?? r.newDefaults?.[f.key] ?? self ?? f.default;
    }
    return v;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.version]);
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const readOnly = !!r.readOnly || !can(mode === 'create' ? r.kit.permissions.create : r.kit.permissions.update) || (!!row && !!row.deletedAt);
  const sections = [...new Set(fields.map((f) => f.section ?? 'Details'))];
  const busy = create.isPending || update.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = clean(values, mode);
    let payload: Record<string, unknown> = body;
    if (row) {
      // PATCH only what changed, with the version for optimistic locking.
      payload = { version: row.version };
      for (const [k, v] of Object.entries(body)) if (JSON.stringify(v) !== JSON.stringify(initial[k] ?? null) && !(initial[k] === undefined && v === null)) payload[k] = v;
      if (Object.keys(payload).length === 1) { toast('info', 'Nothing to save.'); return; }
    }
    const schema = row ? r.kit.updateSchema : r.kit.createSchema;
    const { version: _v, ...checkable } = payload;
    void _v;
    const parsed = schema.safeParse(checkable);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? ''), i.message])));
      toast('error', 'Some fields need attention.');
      return;
    }
    setErrors({});
    try {
      const saved = row ? await update.mutateAsync(payload) : await create.mutateAsync(parsed.data);
      toast('success', `${r.kit.def.singular} ${row ? 'saved' : 'created'}.`);
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(err.errors.map((x) => [x.path.split('.')[0]!, x.message])));
        toast('error', err.errors.length ? 'Some fields need attention.' : err.message);
      } else toast('error', 'Could not save. Try again.');
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {sections.map((s) => (
        <fieldset key={s} className="space-y-4">
          {sections.length > 1 && <legend className="mb-1 text-section font-semibold">{s}</legend>}
          <div className="grid gap-4 lg:grid-cols-2">
            {fields.filter((f) => (f.section ?? 'Details') === s).map((f) => (
              <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} error={errors[f.key]} disabled={readOnly || (!!row && f.immutable)} editors={r.editors} values={values} />
            ))}
          </div>
        </fieldset>
      ))}
      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-rule bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          <Button type="submit" variant="primary" loading={busy}>{row ? 'Save changes' : `Create ${r.kit.def.singular.toLowerCase()}`}</Button>
        </div>
      )}
    </form>
  );
}

export function CrudForm({ resource: r }: { resource: Resource }) {
  const router = useRouter();
  const { can } = useAuth();
  if (!can(r.kit.permissions.create)) return <EmptyState title="You cannot add records here" hint="Ask an admin for access." />;
  return (
    <>
      <PageHeader title={`New ${r.kit.def.singular.toLowerCase()}`} {...(r.scope ? { scope: `${r.scope} · ${r.kit.def.plural}` } : { scope: r.kit.def.plural })} />
      <PageBody wide={false}><CrudFormBody resource={r} onSaved={() => router.push(r.routeBase)} onCancel={() => router.push(r.routeBase)} /></PageBody>
    </>
  );
}

export function FormSkeleton() {
  return <div className="space-y-4 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-10 max-w-xl" /><Skeleton className="h-10 max-w-xl" /><Skeleton className="h-10 max-w-xl" /></div>;
}
export { titleOf };
