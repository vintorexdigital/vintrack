'use client';
import { Field, Input, Select, Toggle } from '@trackrex/ui';
import { MultiRef } from './fields-extra';

export type SpecItem =
  | { group: string; hint?: string }
  | {
      path: string;
      label: string;
      kind: 'bool' | 'num' | 'text' | 'time' | 'select' | 'multi' | 'refs' | 'lines' | 'nullable-num';
      options?: { value: string; label: string }[];
      help?: string;
      min?: number;
      max?: number;
      entity?: string;
      when?: (root: Record<string, unknown>) => boolean;
    };

export const getPath = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);

export function setPath<T>(o: T, path: string, v: unknown): T {
  const [head, ...rest] = path.split('.');
  const obj = { ...(o as Record<string, unknown>) };
  obj[head!] = rest.length ? setPath(obj[head!] ?? {}, rest.join('.'), v) : v;
  return obj as T;
}

const opts = (xs: string[]) => xs.map((value) => ({ value, label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));
export const options = opts;

/** Renders a nested settings object from a flat spec: toggles, numbers, selects and multi-selects bound by dotted path. */
export function SpecForm({ spec, value, onChange, disabled }: { spec: SpecItem[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; disabled?: boolean | undefined }) {
  return (
    <div className="space-y-4">
      {spec.map((s, i) => {
        if ('group' in s) return <div key={i} className="border-t border-rule pt-4 first:border-t-0 first:pt-0"><h3 className="text-sm font-semibold text-ink">{s.group}</h3>{s.hint && <p className="text-xs text-muted">{s.hint}</p>}</div>;
        if (s.when && !s.when(value)) return null;
        const v = getPath(value, s.path);
        const set = (x: unknown) => onChange(setPath(value, s.path, x));
        switch (s.kind) {
          case 'bool': return <Toggle key={s.path} label={s.label} help={s.help} checked={!!v} onChange={set} disabled={disabled ?? false} />;
          case 'num':
          case 'nullable-num':
            return (
              <Field key={s.path} label={s.label} help={s.help}>
                {(id, d) => <Input id={id} aria-describedby={d} type="number" min={s.min} max={s.max} disabled={disabled} className="max-w-40 tabular-nums" value={v === null || v === undefined ? '' : String(v)} onChange={(e) => set(e.target.value === '' ? (s.kind === 'nullable-num' ? null : undefined) : Number(e.target.value))} />}
              </Field>
            );
          case 'time': return <Field key={s.path} label={s.label} help={s.help}>{(id, d) => <Input id={id} aria-describedby={d} type="time" disabled={disabled} className="max-w-40" value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />}</Field>;
          case 'text': return <Field key={s.path} label={s.label} help={s.help}>{(id, d) => <Input id={id} aria-describedby={d} disabled={disabled} value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />}</Field>;
          case 'select': return <Field key={s.path} label={s.label} help={s.help}>{(id, d) => <Select id={id} aria-describedby={d} disabled={disabled} className="max-w-64" value={(v as string) ?? ''} onChange={(e) => set(e.target.value)}>{s.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>;
          case 'multi': {
            const cur = (v as string[]) ?? [];
            return (
              <fieldset key={s.path}>
                <legend className="text-sm font-medium">{s.label}</legend>
                {s.help && <p className="text-xs text-muted">{s.help}</p>}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {s.options?.map((o) => (
                    <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-sm">
                      <input type="checkbox" disabled={disabled} className="size-4 accent-[var(--brand-primary)]" checked={cur.includes(o.value)} onChange={(e) => set(e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} />{o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          case 'lines': return <Field key={s.path} label={s.label} help={s.help}>{(id, d) => <Input id={id} aria-describedby={d} disabled={disabled} value={((v as string[]) ?? []).join(', ')} onChange={(e) => set(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="10.0.0.0/24, 203.0.113.7" />}</Field>;
          case 'refs': return <Field key={s.path} label={s.label} help={s.help}>{(id) => <MultiRef id={id} entity={s.entity!} value={(v as string[]) ?? []} onChange={set} />}</Field>;
        }
      })}
    </div>
  );
}
