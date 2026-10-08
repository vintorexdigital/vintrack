'use client';
import { Button, Menu } from '@trackrex/ui';
import { Plus, Trash2 } from 'lucide-react';
import { SpecForm, type SpecItem } from '@/shared/crud/spec-form';
import type { EditorProps } from '@/shared/crud/resource';

type Rule = { type: string } & Record<string, unknown>;
const CONSEQ = [{ value: 'late_mark', label: 'Count as a late mark' }, { value: 'half_day', label: 'Deduct half a day' }, { value: 'full_day', label: 'Deduct a full day' }];
const SOFT = [{ value: 'half_day', label: 'Mark as half day' }, { value: 'flag', label: 'Flag only' }];

const RULES: Record<string, { label: string; blurb: string; defaults: Rule; spec: SpecItem[] }> = {
  late_punch_in: { label: 'Late punch-in', blurb: 'After a number of late marks in a cycle, apply a consequence.', defaults: { type: 'late_punch_in', graceMinutes: 15, afterMarks: 3, consequence: 'half_day' },
    spec: [{ path: 'graceMinutes', label: 'Grace (minutes)', kind: 'num', min: 0, max: 240 }, { path: 'afterMarks', label: 'Apply from the Nth late mark in a cycle', kind: 'num', min: 1, max: 31 }, { path: 'consequence', label: 'Consequence', kind: 'select', options: CONSEQ }] },
  early_punch_out: { label: 'Early punch-out', blurb: 'Leaving before the shift ends.', defaults: { type: 'early_punch_out', thresholdMinutes: 15, afterMarks: 3, consequence: 'half_day' },
    spec: [{ path: 'thresholdMinutes', label: 'Threshold (minutes)', kind: 'num', min: 0, max: 240 }, { path: 'afterMarks', label: 'Apply from the Nth early mark in a cycle', kind: 'num', min: 1, max: 31 }, { path: 'consequence', label: 'Consequence', kind: 'select', options: CONSEQ }] },
  min_hours: { label: 'Minimum hours', blurb: 'Short days become a half day or absence.', defaults: { type: 'min_hours', halfDayBelowMinutes: 300, absentBelowMinutes: 120 },
    spec: [{ path: 'halfDayBelowMinutes', label: 'Half day below (minutes worked)', kind: 'num', min: 0, max: 1440 }, { path: 'absentBelowMinutes', label: 'Absent below (minutes worked)', kind: 'num', min: 0, max: 1440 }] },
  productivity: { label: 'Productivity', blurb: 'Desktop staff: low productive time.', defaults: { type: 'productivity', minProductiveMinutes: 240, consequence: 'flag' },
    spec: [{ path: 'minProductiveMinutes', label: 'Minimum productive minutes', kind: 'num', min: 0, max: 1440 }, { path: 'consequence', label: 'Consequence', kind: 'select', options: SOFT }] },
  task_completion: { label: 'Task completion', blurb: 'Field staff: too few completed visits.', defaults: { type: 'task_completion', minTasks: 3, consequence: 'flag' },
    spec: [{ path: 'minTasks', label: 'Minimum completed tasks', kind: 'num', min: 0, max: 500 }, { path: 'consequence', label: 'Consequence', kind: 'select', options: SOFT }] },
  missing_punch_out: { label: 'Missing punch-out', blurb: 'No punch-out by the end of the day.', defaults: { type: 'missing_punch_out', treatment: 'half_day' },
    spec: [{ path: 'treatment', label: 'Treat as', kind: 'select', options: [{ value: 'auto_punch_out', label: 'Auto punch-out at shift end' }, { value: 'half_day', label: 'Half day' }, { value: 'pending_regularization', label: 'Pending regularization' }] }] },
  overtime: { label: 'Overtime', blurb: 'Time beyond the shift goes to the payroll export.', defaults: { type: 'overtime', thresholdMinutes: 30 },
    spec: [{ path: 'thresholdMinutes', label: 'Count only beyond (minutes)', kind: 'num', min: 0, max: 720 }] },
};

/** An ordered list of rules; each type has its own small form. Published policies are read-only. */
export function PolicyRulesEditor({ value, onChange, disabled }: EditorProps) {
  const rules = (value as Rule[] | undefined) ?? [];
  return (
    <div className="space-y-3">
      {rules.length === 0 && <p className="text-sm text-muted">No rules yet. Add the first one below.</p>}
      {rules.map((r, i) => {
        const def = RULES[r.type];
        if (!def) return null;
        return (
          <section key={i} className="rounded-overlay border border-rule p-3">
            <header className="mb-3 flex items-start justify-between gap-2">
              <div><h3 className="text-sm font-semibold">{i + 1}. {def.label}</h3><p className="text-xs text-muted">{def.blurb}</p></div>
              {!disabled && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange(rules.filter((_, j) => j !== i))}>Remove</Button>}
            </header>
            <SpecForm spec={def.spec} value={r} onChange={(nv) => onChange(rules.map((x, j) => (j === i ? (nv as Rule) : x)))} disabled={disabled} />
          </section>
        );
      })}
      {!disabled && <Menu align="start" trigger={<Button icon={<Plus className="size-4" aria-hidden />}>Add rule</Button>} items={Object.entries(RULES).map(([k, d]) => ({ label: d.label, onSelect: () => onChange([...rules, { ...d.defaults }]), disabled: rules.some((r) => r.type === k) }))} />}
    </div>
  );
}
