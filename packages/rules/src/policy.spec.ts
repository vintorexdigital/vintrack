import { describe, expect, it } from 'vitest';
import { evaluatePolicy, payableDays, type PolicyRule } from './policy.js';
import type { DayBase, DayFacts } from './attendance.js';

const present: DayBase = { code: 'P', presentUnits: 1, absentUnits: 0, leaveUnits: 0, offDay: false, overridden: false, workedOnOffDay: false };
const facts = (o: Partial<DayFacts> = {}): DayFacts => ({
  date: '2026-08-12', firstIn: 1, lastOut: 2, workedMinutes: 540, breakMinutes: 0, lateMinutes: 0,
  earlyOutMinutes: 0, missingPunchOut: false, overtimeMinutes: 0, sessions: [], ...o,
});
const ctx = (o = {}) => ({ lateMarksBefore: 0, earlyMarksBefore: 0, ...o });

describe('policy engine', () => {
  const late: PolicyRule = { type: 'late_punch_in', graceMinutes: 15, afterMarks: 3, consequence: 'half_day' };

  it('does nothing for non-working outcomes and overrides', () => {
    const abs = { ...present, code: 'AB' as const, presentUnits: 0, absentUnits: 1 };
    expect(evaluatePolicy(abs, facts({ lateMinutes: 60 }), [late], ctx()).lateMark).toBe(false);
    expect(evaluatePolicy({ ...present, overridden: true }, facts({ lateMinutes: 60 }), [late], ctx()).lateMark).toBe(false);
  });

  it('ignores lateness within grace', () => {
    const r = evaluatePolicy(present, facts({ lateMinutes: 15 }), [late], ctx());
    expect(r.lateMark).toBe(false);
    expect(r.code).toBe('P');
  });

  it('counts a late mark and escalates on the Nth', () => {
    const first = evaluatePolicy(present, facts({ lateMinutes: 22 }), [late], ctx());
    expect(first).toMatchObject({ lateMark: true, lateByPolicy: false, deductionUnits: 0, lateMarksAfter: 1 });
    expect(first.explanation[0]).toBe('Late by 22 min; 1st late mark this cycle.');
    const third = evaluatePolicy(present, facts({ lateMinutes: 22 }), [late], ctx({ lateMarksBefore: 2 }));
    expect(third).toMatchObject({ lateByPolicy: true, deductionUnits: 0.5, lateMarksAfter: 3 });
    expect(third.explanation[0]).toBe('Late by 22 min; 3rd late mark this cycle; half day deducted.');
  });

  it('supports late-mark and full-day consequences', () => {
    const lm = evaluatePolicy(present, facts({ lateMinutes: 30 }), [{ ...late, afterMarks: 1, consequence: 'late_mark' }], ctx());
    expect(lm.deductionUnits).toBe(0);
    expect(lm.explanation[0]).toContain('counted as a late mark');
    const full = evaluatePolicy(present, facts({ lateMinutes: 30 }), [{ ...late, afterMarks: 1, consequence: 'full_day' }], ctx());
    expect(full.deductionUnits).toBe(1);
  });

  it('applies early punch-out rules', () => {
    const rule: PolicyRule = { type: 'early_punch_out', thresholdMinutes: 10, afterMarks: 2, consequence: 'half_day' };
    const a = evaluatePolicy(present, facts({ earlyOutMinutes: 30 }), [rule], ctx());
    expect(a).toMatchObject({ earlyMark: true, deductionUnits: 0, earlyMarksAfter: 1 });
    const b = evaluatePolicy(present, facts({ earlyOutMinutes: 30 }), [rule], ctx({ earlyMarksBefore: 1 }));
    expect(b.deductionUnits).toBe(0.5);
    expect(evaluatePolicy(present, facts({ earlyOutMinutes: 5 }), [rule], ctx()).earlyMark).toBe(false);
  });

  it('downgrades by minimum hours', () => {
    const rule: PolicyRule = { type: 'min_hours', halfDayBelowMinutes: 420, absentBelowMinutes: 240 };
    expect(evaluatePolicy(present, facts({ workedMinutes: 400 }), [rule], ctx())).toMatchObject({ code: 'HP', presentUnits: 0.5 });
    expect(evaluatePolicy(present, facts({ workedMinutes: 100 }), [rule], ctx())).toMatchObject({ code: 'AB', absentUnits: 1 });
    expect(evaluatePolicy(present, facts({ workedMinutes: 500 }), [rule], ctx()).code).toBe('P');
    expect(evaluatePolicy(present, facts({ workedMinutes: 10, missingPunchOut: true }), [rule], ctx()).code).toBe('P');
  });

  it('handles missing punch-out treatments', () => {
    const missing = facts({ missingPunchOut: true });
    expect(evaluatePolicy(present, missing, [{ type: 'missing_punch_out', treatment: 'half_day' }], ctx()).code).toBe('HP');
    expect(evaluatePolicy(present, missing, [{ type: 'missing_punch_out', treatment: 'pending_regularization' }], ctx()).code).toBe('PA');
    const auto = evaluatePolicy(present, missing, [{ type: 'missing_punch_out', treatment: 'auto_punch_out' }], ctx());
    expect(auto.code).toBe('P');
    expect(auto.flags).toContain('auto_punch_out');
    expect(evaluatePolicy(present, facts(), [{ type: 'missing_punch_out', treatment: 'half_day' }], ctx()).code).toBe('P');
  });

  it('applies productivity and task rules only when data exists', () => {
    const prod: PolicyRule = { type: 'productivity', minProductiveMinutes: 240, consequence: 'half_day' };
    expect(evaluatePolicy(present, facts(), [prod], ctx()).code).toBe('P');
    expect(evaluatePolicy(present, facts(), [prod], ctx({ productiveMinutes: 100 })).code).toBe('HP');
    expect(evaluatePolicy(present, facts(), [prod], ctx({ productiveMinutes: 300 })).code).toBe('P');
    const flag = evaluatePolicy(present, facts(), [{ ...prod, consequence: 'flag' }], ctx({ productiveMinutes: 100 }));
    expect(flag.flags).toContain('low_productivity');
    const task: PolicyRule = { type: 'task_completion', minTasks: 3, consequence: 'half_day' };
    expect(evaluatePolicy(present, facts(), [task], ctx({ completedTasks: 1 })).code).toBe('HP');
    expect(evaluatePolicy(present, facts(), [task], ctx({ completedTasks: 3 })).code).toBe('P');
    expect(evaluatePolicy(present, facts(), [task], ctx()).code).toBe('P');
    expect(evaluatePolicy(present, facts(), [{ ...task, consequence: 'flag' }], ctx({ completedTasks: 0 })).flags).toContain('low_task_completion');
  });

  it('computes overtime beyond the threshold', () => {
    const r = evaluatePolicy(present, facts({ overtimeMinutes: 95 }), [{ type: 'overtime', thresholdMinutes: 30 }], ctx());
    expect(r.overtimeMinutes).toBe(65);
    expect(evaluatePolicy(present, facts({ overtimeMinutes: 20 }), [{ type: 'overtime', thresholdMinutes: 30 }], ctx()).overtimeMinutes).toBe(0);
  });

  it('is deterministic and caps deductions at one day', () => {
    const rules: PolicyRule[] = [
      { type: 'late_punch_in', graceMinutes: 0, afterMarks: 1, consequence: 'full_day' },
      { type: 'early_punch_out', thresholdMinutes: 0, afterMarks: 1, consequence: 'half_day' },
    ];
    const f = facts({ lateMinutes: 30, earlyOutMinutes: 30 });
    const a = evaluatePolicy(present, f, rules, ctx());
    expect(a.deductionUnits).toBe(1);
    expect(evaluatePolicy(present, f, rules, ctx())).toEqual(a);
  });

  it('formats ordinals', () => {
    for (const [n, s] of [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [21, '21st']] as const) {
      const r = evaluatePolicy(present, facts({ lateMinutes: 20 }), [late], ctx({ lateMarksBefore: n - 1 }));
      expect(r.explanation[0]).toContain(`${s} late mark`);
    }
  });

  it('rolls up payable days', () => {
    expect(payableDays([
      { presentUnits: 1, leaveUnits: 0, paidLeave: false, offDay: false, deductionUnits: 0.5 },
      { presentUnits: 0, leaveUnits: 1, paidLeave: true, offDay: false, deductionUnits: 0 },
      { presentUnits: 0, leaveUnits: 1, paidLeave: false, offDay: false, deductionUnits: 0 },
      { presentUnits: 0, leaveUnits: 0, paidLeave: false, offDay: true, deductionUnits: 0 },
    ])).toBe(2.5);
    expect(payableDays([{ presentUnits: 0, leaveUnits: 0, paidLeave: false, offDay: false, deductionUnits: 1 }])).toBe(0);
  });
});
