'use client';
import { Button, Field, Input, Select, Toggle } from '@trackrex/ui';
import { QUESTION_TYPES, type Question, type QuestionType } from '@trackrex/schemas';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { EditorProps } from '@/shared/crud/resource';

const TYPE_LABEL: Record<QuestionType, string> = { text: 'Short text', textarea: 'Long text', number: 'Number', yes_no: 'Yes or no', select: 'Choose one', multiselect: 'Choose several', date: 'Date', rating: 'Rating (1 to 5)', photo: 'Photo' };
const slug = (label: string, taken: Set<string>) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]+/, '').slice(0, 30) || 'question';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
};

/** Edits the question list of a task form. Ids are made from the wording once and then stay stable, because answers refer to them. */
export function FormBuilderEditor({ value, onChange, disabled, error }: EditorProps) {
  const qs = (value as Question[] | undefined) ?? [];
  const set = (i: number, patch: Partial<Question>) => onChange(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => { const next = [...qs]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x!); onChange(next); };
  const add = () => onChange([...qs, { id: slug('question', new Set(qs.map((q) => q.id))), label: '', type: 'text', required: false }]);
  return (
    <div className="space-y-3">
      {qs.map((q, i) => (
        <fieldset key={i} className="space-y-3 rounded-overlay border border-rule p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">Question {i + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Question" required className="sm:col-span-2">{(id) => <Input id={id} value={q.label} onChange={(e) => set(i, { label: e.target.value, ...(q.label === '' || q.id.startsWith('question') ? { id: slug(e.target.value, new Set(qs.filter((_, j) => j !== i).map((x) => x.id))) } : {}) })} />}</Field>
            <Field label="Answer type">{(id) => <Select id={id} value={q.type} onChange={(e) => set(i, { type: e.target.value as QuestionType, ...(e.target.value === 'select' || e.target.value === 'multiselect' ? { options: q.options?.length ? q.options : [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] } : {}) })}>{QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>}</Field>
            <Toggle label="Required" checked={q.required} onChange={(v) => set(i, { required: v })} disabled={disabled ?? false} />
            {(q.type === 'select' || q.type === 'multiselect') && (
              <Field label="Options" help="One per line." className="sm:col-span-2">{(id) => <textarea id={id} rows={3} className="w-full rounded-card border border-rule bg-surface p-2 text-sm" value={(q.options ?? []).map((o) => o.label).join('\n')} onChange={(e) => set(i, { options: e.target.value.split('\n').filter((l) => l.trim()).map((l) => ({ label: l.trim(), value: l.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'option' })) })} />}</Field>
            )}
            {q.type === 'number' && (<>
              <Field label="Smallest allowed">{(id) => <Input id={id} type="number" value={q.min ?? ''} onChange={(e) => set(i, { min: e.target.value === '' ? undefined as never : Number(e.target.value) })} />}</Field>
              <Field label="Largest allowed">{(id) => <Input id={id} type="number" value={q.max ?? ''} onChange={(e) => set(i, { max: e.target.value === '' ? undefined as never : Number(e.target.value) })} />}</Field>
            </>)}
            {i > 0 && (
              <Field label="Show only when" help="Optional. Depends on an earlier yes/no or choice question." className="sm:col-span-2">
                {(id) => (
                  <div className="flex flex-wrap gap-2">
                    <Select id={id} aria-label="Depends on" value={q.showIf?.questionId ?? ''} onChange={(e) => set(i, { showIf: e.target.value ? { questionId: e.target.value, equals: true } : undefined as never })}>
                      <option value="">Always show</option>
                      {qs.slice(0, i).filter((p) => p.type === 'yes_no' || p.type === 'select').map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
                    </Select>
                    {q.showIf && (() => {
                      const dep = qs.find((p) => p.id === q.showIf!.questionId);
                      return (
                        <Select aria-label="Has the answer" value={String(q.showIf.equals)} onChange={(e) => set(i, { showIf: { questionId: q.showIf!.questionId, equals: dep?.type === 'yes_no' ? e.target.value === 'true' : e.target.value } })}>
                          {dep?.type === 'yes_no' ? <><option value="true">Yes</option><option value="false">No</option></> : (dep?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      );
                    })()}
                  </div>
                )}
              </Field>
            )}
          </div>
          {!disabled && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="size-4" aria-hidden />}>Up</Button>
              <Button size="sm" variant="ghost" disabled={i === qs.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="size-4" aria-hidden />}>Down</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(qs.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" aria-hidden />}>Remove</Button>
            </div>
          )}
        </fieldset>
      ))}
      {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      {!disabled && <Button icon={<Plus className="size-4" aria-hidden />} onClick={add}>Add question</Button>}
    </div>
  );
}
