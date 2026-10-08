'use client';
import { useQuery } from '@tanstack/react-query';
import { Field, Input, Select, Textarea } from '@trackrex/ui';
import { visibleQuestions, type Answers, type AnswerValue, type Question } from '@trackrex/schemas';
import { useState } from 'react';
import { api, imageUrl, toJpeg } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

export function PhotoView({ photoKey, alt }: { photoKey: string; alt: string }) {
  const q = useQuery({ queryKey: ['form-photo', photoKey], queryFn: () => imageUrl(`/v1/files/${photoKey}`), staleTime: Infinity });
  return q.data ? <img src={q.data} alt={alt} className="max-h-56 rounded-card border border-rule object-contain" /> : <span className="text-xs text-muted">Loading photo…</span>;
}

function PhotoInput({ q, value, onChange, disabled }: { q: Question; value: string | undefined; onChange: (v: AnswerValue | undefined) => void; disabled: boolean }) {
  const { me } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file || !me?.user) return;
    setBusy(true); setErr(null);
    try {
      const key = `forms/${me.company.id}/${me.user.id}/${crypto.randomUUID()}.jpg`;
      await api(`/v1/files/${key}`, { method: 'PUT', blob: await toJpeg(file), idempotencyKey: crypto.randomUUID() });
      onChange(key);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload the photo.'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {value && <PhotoView photoKey={value} alt={q.label} />}
      <input type="file" accept="image/*" capture="environment" aria-label={q.label} disabled={disabled || busy} onChange={(e) => void pick(e.target.files?.[0])} className="block text-sm" />
      {busy && <p className="text-xs text-muted">Uploading…</p>}
      {err && <p role="alert" className="text-xs text-absent">{err}</p>}
    </div>
  );
}

/** Renders a form definition and reports answers. The same rules (`validateAnswers`) run on the server. */
export function FormFill({ questions, answers, onChange, errors = {}, disabled = false }: { questions: Question[]; answers: Answers; onChange: (a: Answers) => void; errors?: Record<string, string>; disabled?: boolean }) {
  const set = (id: string, v: AnswerValue | undefined) => { const next = { ...answers }; if (v === undefined || v === '') delete next[id]; else next[id] = v; onChange(next); };
  return (
    <div className="space-y-4">
      {visibleQuestions(questions, answers).map((q) => {
        const v = answers[q.id];
        return (
          <Field key={q.id} label={q.label} help={q.help} error={errors[q.id]} required={q.required}>
            {(id, d) => {
              const common = { id, 'aria-describedby': d, 'aria-invalid': !!errors[q.id], disabled };
              switch (q.type) {
                case 'text': return <Input {...common} value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} />;
                case 'textarea': return <Textarea {...common} rows={3} value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} />;
                case 'number': return <Input {...common} type="number" inputMode="decimal" step="any" value={v === undefined ? '' : String(v)} onChange={(e) => set(q.id, e.target.value === '' ? undefined : Number(e.target.value))} />;
                case 'date': return <Input {...common} type="date" value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} />;
                case 'select': return <Select {...common} value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value || undefined)}><option value="">Choose…</option>{q.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
                case 'yes_no': return (
                  <div role="radiogroup" aria-label={q.label} className="flex gap-4">
                    {[[true, 'Yes'], [false, 'No']].map(([val, label]) => <label key={String(val)} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={q.id} className="size-4 accent-[var(--brand-primary)]" disabled={disabled} checked={v === val} onChange={() => set(q.id, val as boolean)} />{label as string}</label>)}
                  </div>
                );
                case 'rating': return (
                  <div role="radiogroup" aria-label={q.label} className="flex gap-2">
                    {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => <button key={n} type="button" role="radio" aria-checked={v === n} disabled={disabled} onClick={() => set(q.id, n)} className={`size-11 rounded-card border text-sm font-medium tabular-nums md:size-9 ${v === n ? 'border-brand bg-brand text-white' : 'border-rule bg-surface'}`}>{n}</button>)}
                  </div>
                );
                case 'multiselect': {
                  const cur = (v as string[] | undefined) ?? [];
                  return (
                    <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label={q.label}>
                      {q.options?.map((o) => <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand-primary)]" disabled={disabled} checked={cur.includes(o.value)} onChange={(e) => set(q.id, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} />{o.label}</label>)}
                    </div>
                  );
                }
                case 'photo': return <PhotoInput q={q} value={v as string | undefined} onChange={(x) => set(q.id, x)} disabled={disabled} />;
              }
            }}
          </Field>
        );
      })}
    </div>
  );
}

/** Read-only answers for managers. */
export function AnswerList({ questions, answers }: { questions: Question[]; answers: Answers }) {
  const shown = visibleQuestions(questions, answers);
  return (
    <dl className="space-y-3">
      {shown.map((q) => {
        const v = answers[q.id];
        const label = (val: AnswerValue | undefined) => (val === undefined ? '–' : q.type === 'yes_no' ? (val ? 'Yes' : 'No') : Array.isArray(val) ? val.map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join(', ') : q.type === 'select' ? q.options?.find((o) => o.value === val)?.label ?? String(val) : String(val));
        return (
          <div key={q.id}>
            <dt className="text-xs text-muted">{q.label}</dt>
            <dd className="text-sm">{q.type === 'photo' && typeof v === 'string' ? <PhotoView photoKey={v} alt={q.label} /> : label(v)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
