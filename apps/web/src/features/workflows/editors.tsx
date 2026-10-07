'use client';
import { Button, Field, Input, Select, Toggle } from '@trackrex/ui';
import { EMPLOYEE_FIELDS, WORKFLOW_TRIGGERS, type Recipient, type WorkflowStep } from '@trackrex/schemas';
import type { Condition } from '@trackrex/rules';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { EditorProps } from '@/shared/crud/resource';
import { RefPicker } from '@/shared/crud/fields';

const OPS: { value: Condition['op']; label: string }[] = [
  { value: 'eq', label: 'is' }, { value: 'ne', label: 'is not' }, { value: 'gt', label: 'is more than' }, { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' }, { value: 'lte', label: 'is at most' }, { value: 'contains', label: 'contains' }, { value: 'exists', label: 'is filled in' },
];

/** "Only if" rules. The fields offered depend on the trigger the workflow is waiting for. */
export function ConditionsEditor({ value, onChange, disabled, values }: EditorProps) {
  const list = (value as Condition[] | undefined) ?? [];
  const trigger = String(values?.trigger ?? '');
  const fields = [...(WORKFLOW_TRIGGERS.find((t) => t.type === trigger)?.fields ?? []), ...EMPLOYEE_FIELDS];
  const set = (i: number, patch: Partial<Condition>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-sm text-muted">No conditions: it runs every time.</p>}
      {list.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <Field label="Field">{(id) => <Select id={id} disabled={disabled} value={c.path} onChange={(e) => set(i, { path: e.target.value })}>{!fields.some((f) => f.path === c.path) && <option value={c.path}>{c.path}</option>}{fields.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}</Select>}</Field>
          <Field label="Test">{(id) => <Select id={id} disabled={disabled} value={c.op} onChange={(e) => set(i, { op: e.target.value as Condition['op'] })}>{OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>
          {c.op !== 'exists' && <Field label="Value">{(id) => <Input id={id} disabled={disabled} value={String(c.value ?? '')} onChange={(e) => set(i, { value: e.target.value })} />}</Field>}
          {!disabled && <Button size="sm" variant="ghost" onClick={() => onChange(list.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" aria-hidden />}>Remove</Button>}
        </div>
      ))}
      {!disabled && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...list, { path: fields[0]?.path ?? 'payload.amount', op: 'eq', value: '' }])}>Add condition</Button>}
    </div>
  );
}

const KINDS: { value: Recipient['kind']; label: string }[] = [
  { value: 'subject_employee', label: 'The person it is about' }, { value: 'manager', label: 'Their manager' }, { value: 'manager_chain', label: 'A manager further up' },
  { value: 'employee', label: 'A specific employee' }, { value: 'role', label: 'Everyone with a role' },
];

function RecipientInput({ value, onChange, disabled }: { value: Recipient; onChange: (r: Recipient) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="To">{(id) => (
        <Select id={id} disabled={disabled} value={value.kind} onChange={(e) => {
          const k = e.target.value as Recipient['kind'];
          onChange(k === 'manager_chain' ? { kind: k, level: 2 } : k === 'employee' ? { kind: k, employeeId: '' } : k === 'role' ? { kind: k, roleKey: 'admin' } : ({ kind: k } as Recipient));
        }}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
      )}</Field>
      {value.kind === 'manager_chain' && <Field label="Levels up">{(id) => <Input id={id} type="number" min={1} max={5} className="w-24" disabled={disabled} value={value.level} onChange={(e) => onChange({ kind: 'manager_chain', level: Number(e.target.value) || 1 })} />}</Field>}
      {value.kind === 'employee' && <Field label="Employee">{(id) => <RefPicker id={id} entity="employees" value={value.employeeId || null} onChange={(v) => onChange({ kind: 'employee', employeeId: v ?? '' })} disabled={disabled} />}</Field>}
      {value.kind === 'role' && <Field label="Role key" help="For example admin, hr_admin, manager.">{(id) => <Input id={id} disabled={disabled} value={value.roleKey} onChange={(e) => onChange({ kind: 'role', roleKey: e.target.value })} />}</Field>}
    </div>
  );
}

const STEP_LABEL: Record<WorkflowStep['type'], string> = { notify: 'Send a notification', create_task: 'Create a task', delay: 'Wait', webhook: 'Call a web address', approval: 'Ask for approval' };
const blank = (type: WorkflowStep['type']): WorkflowStep => {
  switch (type) {
    case 'notify': return { type, to: { kind: 'manager' }, title: '{{employee.name}}: something happened' };
    case 'create_task': return { type, assignTo: { kind: 'subject_employee' }, title: 'Follow up', priority: 'normal' };
    case 'delay': return { type, minutes: 60 };
    case 'webhook': return { type, url: 'https://', includePayload: true };
    case 'approval': return { type, approver: { kind: 'manager' }, title: 'Please approve {{employee.name}}' };
  }
};

/** The "Then" list. Texts can use {{employee.name}} and {{payload.…}} placeholders. */
export function StepsEditor({ value, onChange, disabled, error }: EditorProps) {
  const steps = (value as WorkflowStep[] | undefined) ?? [];
  const set = (i: number, s: WorkflowStep) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) => { const n = [...steps]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); };
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <fieldset key={i} className="space-y-3 rounded-overlay border border-rule p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">{i + 1}. {STEP_LABEL[s.type]}</legend>
          {s.type === 'notify' && (<>
            <RecipientInput value={s.to} onChange={(to) => set(i, { ...s, to })} disabled={!!disabled} />
            <Field label="Title" required>{(id) => <Input id={id} value={s.title} onChange={(e) => set(i, { ...s, title: e.target.value })} />}</Field>
            <Field label="Detail">{(id) => <Input id={id} value={s.body ?? ''} onChange={(e) => set(i, { ...s, body: e.target.value || undefined as never })} />}</Field>
          </>)}
          {s.type === 'create_task' && (<>
            <RecipientInput value={s.assignTo} onChange={(assignTo) => set(i, { ...s, assignTo })} disabled={!!disabled} />
            <Field label="Task title" required>{(id) => <Input id={id} value={s.title} onChange={(e) => set(i, { ...s, title: e.target.value })} />}</Field>
            <div className="flex flex-wrap gap-3">
              <Field label="Due in (hours)">{(id) => <Input id={id} type="number" min={1} className="w-28" value={s.dueInHours ?? ''} onChange={(e) => set(i, { ...s, dueInHours: e.target.value ? Number(e.target.value) : undefined as never })} />}</Field>
              <Field label="Priority">{(id) => <Select id={id} value={s.priority} onChange={(e) => set(i, { ...s, priority: e.target.value as 'low' })}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}</Select>}</Field>
            </div>
          </>)}
          {s.type === 'delay' && <Field label="Wait for (minutes)">{(id) => <Input id={id} type="number" min={1} className="w-32" value={s.minutes} onChange={(e) => set(i, { ...s, minutes: Number(e.target.value) || 1 })} />}</Field>}
          {s.type === 'webhook' && (<>
            <Field label="Address" required help="Must be https. Each call is signed; see the workflow page for the key.">{(id) => <Input id={id} type="url" value={s.url} onChange={(e) => set(i, { ...s, url: e.target.value })} />}</Field>
            <Toggle label="Include the event details" checked={s.includePayload} onChange={(v) => set(i, { ...s, includePayload: v })} disabled={!!disabled} />
          </>)}
          {s.type === 'approval' && (<>
            <RecipientInput value={s.approver} onChange={(approver) => set(i, { ...s, approver })} disabled={!!disabled} />
            <Field label="What they are asked" required>{(id) => <Input id={id} value={s.title} onChange={(e) => set(i, { ...s, title: e.target.value })} />}</Field>
            <p className="text-xs text-muted">The workflow stops here until one of them approves; a rejection ends it.</p>
          </>)}
          {!disabled && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="size-4" aria-hidden />}>Up</Button>
              <Button size="sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="size-4" aria-hidden />}>Down</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(steps.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" aria-hidden />}>Remove</Button>
            </div>
          )}
        </fieldset>
      ))}
      {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STEP_LABEL) as WorkflowStep['type'][]).map((t) => <Button key={t} icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...steps, blank(t)])}>{STEP_LABEL[t]}</Button>)}
        </div>
      )}
    </div>
  );
}
