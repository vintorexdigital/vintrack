'use client';
import { Button, Field, Input, Select, Toggle } from '@trackrex/ui';
import { Plus, Trash2 } from 'lucide-react';
import { options, SpecForm, type SpecItem } from '@/shared/crud/spec-form';
import type { EditorProps } from '@/shared/crud/resource';

interface Tier {
  minYearsExperience: number; effectiveAfterMonths: number; creditTiming: string; accrual: string; totalDays: number; proration: string;
  carryForward?: { maxDays: number; expiryDays?: number };
}
interface Entitlement { tiers: Tier[]; flexible: boolean; compOff: { enabled: boolean; expiryDays: number }; encashable: boolean }

const BLANK_TIER: Tier = { minYearsExperience: 0, effectiveAfterMonths: 0, creditTiming: 'start', accrual: 'monthly', totalDays: 12, proration: 'daily' };
const ACCRUAL = [
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'flat', label: 'Flat, all at once' }, { value: 'equally_distributed', label: 'Equally distributed over the remaining months' },
];

const num = (v: string) => (v === '' ? 0 : Number(v));

/** Several tiers by years of experience, each with its own accrual and carry-forward cap. */
export function EntitlementEditor({ value, onChange, disabled }: EditorProps) {
  const v = (value as Entitlement | undefined) ?? { tiers: [BLANK_TIER], flexible: false, compOff: { enabled: false, expiryDays: 60 }, encashable: false };
  const setTier = (i: number, patch: Partial<Tier>) => onChange({ ...v, tiers: v.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <div className="space-y-4">
      {v.tiers.map((t, i) => (
        <fieldset key={i} className="space-y-3 rounded-overlay border border-rule p-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold">{v.tiers.length > 1 ? `Tier ${i + 1}: ${t.minYearsExperience}+ years of experience` : 'Entitlement'}</legend>
            {v.tiers.length > 1 && !disabled && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange({ ...v, tiers: v.tiers.filter((_, j) => j !== i) })}>Remove tier</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Total days per leave session" required>{(id) => <Input id={id} type="number" min={0} step="0.5" disabled={disabled} value={t.totalDays} onChange={(e) => setTier(i, { totalDays: num(e.target.value) })} />}</Field>
            <Field label="Accrual">{(id) => <Select id={id} disabled={disabled} value={t.accrual} onChange={(e) => setTier(i, { accrual: e.target.value })}>{ACCRUAL.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>}</Field>
            <Field label="Credited">{(id) => <Select id={id} disabled={disabled} value={t.creditTiming} onChange={(e) => setTier(i, { creditTiming: e.target.value })}><option value="start">At the start of each period</option><option value="end">After each period</option></Select>}</Field>
            <Field label="Effective after (months from joining)">{(id) => <Input id={id} type="number" min={0} disabled={disabled} value={t.effectiveAfterMonths} onChange={(e) => setTier(i, { effectiveAfterMonths: num(e.target.value) })} />}</Field>
            <Field label="For employees with at least (years of experience)">{(id) => <Input id={id} type="number" min={0} disabled={disabled} value={t.minYearsExperience} onChange={(e) => setTier(i, { minYearsExperience: num(e.target.value) })} />}</Field>
            <Field label="Mid-period joiners">{(id) => <Select id={id} disabled={disabled} value={t.proration} onChange={(e) => setTier(i, { proration: e.target.value })}><option value="daily">Prorate by days</option><option value="none">Full amount</option></Select>}</Field>
            <Field label="Carry forward at most (days)" help="Leave empty to let unused days lapse.">{(id) => <Input id={id} type="number" min={0} disabled={disabled} value={t.carryForward?.maxDays ?? ''} onChange={(e) => setTier(i, { carryForward: e.target.value === '' ? undefined as never : { maxDays: num(e.target.value), ...(t.carryForward?.expiryDays ? { expiryDays: t.carryForward.expiryDays } : {}) } })} />}</Field>
          </div>
        </fieldset>
      ))}
      {!disabled && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange({ ...v, tiers: [...v.tiers, { ...BLANK_TIER, minYearsExperience: (v.tiers.at(-1)?.minYearsExperience ?? 0) + 5 }] })}>Add tier</Button>}
      <Toggle label="Flexible leave" help="Employees may use the balance any time in the session." checked={v.flexible} onChange={(x) => onChange({ ...v, flexible: x })} disabled={disabled ?? false} />
      <Toggle label="Compensatory off" help="Earned by working on holidays or non-working days; expires." checked={v.compOff.enabled} onChange={(x) => onChange({ ...v, compOff: { ...v.compOff, enabled: x } })} disabled={disabled ?? false} />
      {v.compOff.enabled && <Field label="Comp-off expires after (days)">{(id) => <Input id={id} type="number" min={1} className="max-w-40" disabled={disabled} value={v.compOff.expiryDays} onChange={(e) => onChange({ ...v, compOff: { ...v.compOff, expiryDays: num(e.target.value) } })} />}</Field>}
      <Toggle label="Encashable" help="Included in the payroll export as encashable days." checked={v.encashable} onChange={(x) => onChange({ ...v, encashable: x })} disabled={disabled ?? false} />
    </div>
  );
}

const RESTRICTIONS: SpecItem[] = [
  { group: 'Duration and weekends' },
  { path: 'allowedDurations', label: 'Allowed durations', kind: 'multi', options: [{ value: 'full', label: 'Full day' }, { value: 'first_half', label: 'First half' }, { value: 'second_half', label: 'Second half' }] },
  { path: 'sandwich.mode', label: 'Weekends and holidays inside a leave period', kind: 'select', options: [{ value: 'exclude', label: 'Do not count them' }, { value: 'include', label: 'Count them' }, { value: 'include_if_exceeds', label: 'Count them when the leave is long' }] },
  { path: 'sandwich.thresholdDays', label: 'Long means more than (days)', kind: 'num', min: 1, max: 30, when: (v) => (v.sandwich as { mode?: string })?.mode === 'include_if_exceeds' },
  { group: 'Balance' },
  { path: 'exceedBalance', label: 'When the request exceeds the balance', kind: 'select', options: [{ value: 'block', label: 'Do not allow' }, { value: 'allow', label: 'Allow without limit' }, { value: 'up_to_year_accrual', label: 'Allow up to the full-year entitlement' }] },
  { group: 'Dates' },
  { path: 'pastDaysAllowed', label: 'Past-dated requests up to (days back)', kind: 'num', min: 0, max: 365 },
  { path: 'minNoticeDays', label: 'Minimum notice (days ahead)', kind: 'num', min: 0, max: 365 },
  { path: 'maxFutureDays', label: 'Furthest ahead (days)', kind: 'num', min: 0, max: 730 },
  { group: 'Limits' },
  { path: 'maxDaysPerApplication', label: 'Maximum days per application', kind: 'nullable-num', min: 0.5, max: 366 },
  { path: 'maxConsecutiveDays', label: 'Maximum consecutive days', kind: 'nullable-num', min: 1, max: 366 },
  { path: 'maxApplicationsPerPeriod', label: 'Maximum applications per session', kind: 'nullable-num', min: 1, max: 365 },
  { path: 'attachmentRequiredAfterDays', label: 'Attachment needed beyond (days)', kind: 'nullable-num', min: 0, max: 365 },
  { group: 'Eligibility and approval' },
  { path: 'genders', label: 'Restrict to', kind: 'multi', options: options(['female', 'male', 'other']), help: 'Leave all unchecked for everyone.' },
  { path: 'reasonMandatory', label: 'Reason is mandatory', kind: 'bool' },
  { path: 'showToEmployees', label: 'Show this type and its balance to employees', kind: 'bool' },
  { path: 'autoApprove', label: 'Approve automatically', kind: 'bool' },
];

export function RestrictionsEditor({ value, onChange, disabled }: EditorProps) {
  return <SpecForm spec={RESTRICTIONS} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} disabled={disabled} />;
}
