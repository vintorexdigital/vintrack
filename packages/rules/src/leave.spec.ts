import { describe, expect, it } from 'vitest';
import {
  carryForward, computeAccruals, countLeaveDays, leaveBalance, selectTier, validateLeaveRequest,
  type EntitlementTier, type LeaveRestrictions, type ValidationContext,
} from './leave.js';

const tier = (o: Partial<EntitlementTier> = {}): EntitlementTier => ({
  minYearsExperience: 0, effectiveAfterMonths: 0, creditTiming: 'start', accrual: 'monthly',
  totalDays: 24, proration: 'daily', ...o,
});
const sum = (e: { days: number }[]) => Math.round(e.reduce((s, x) => s + x.days, 0) * 100) / 100;
const S = '2026-01-01';
const E = '2026-12-31';

describe('accruals', () => {
  it('credits monthly for a full-year employee', () => {
    const e = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2024-05-10', tier: tier() });
    expect(e).toHaveLength(12);
    expect(e[0]).toMatchObject({ date: '2026-01-01', days: 2 });
    expect(sum(e)).toBe(24);
  });
  it('prorates a mid-month joiner daily', () => {
    const e = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2026-03-16', tier: tier() });
    expect(e[0]).toMatchObject({ date: '2026-03-16' });
    expect(e[0]!.days).toBeCloseTo(2 * (16 / 31), 2);
    expect(e).toHaveLength(10);
    expect(sum(e)).toBeLessThan(24);
    const flat = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2026-03-16', tier: tier({ proration: 'none' }) });
    expect(flat[0]!.days).toBe(2);
  });
  it('honours the waiting period and end-of-period crediting', () => {
    const e = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2026-02-01', tier: tier({ effectiveAfterMonths: 3, creditTiming: 'end' }) });
    expect(e[0]!.date >= '2026-05-01').toBe(true);
    const end = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2020-01-01', tier: tier({ creditTiming: 'end' }) });
    expect(end[0]!.date).toBe('2026-01-31');
  });
  it('supports quarterly, half-yearly and flat accrual', () => {
    expect(computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2020-01-01', tier: tier({ accrual: 'quarterly' }) }).map((x) => x.days)).toEqual([6, 6, 6, 6]);
    expect(computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2020-01-01', tier: tier({ accrual: 'half_yearly' }) })).toHaveLength(2);
    const flat = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2020-01-01', tier: tier({ accrual: 'flat' }) });
    expect(flat).toEqual([{ date: S, days: 24, kind: 'accrual' }]);
    const flatMid = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2026-07-01', tier: tier({ accrual: 'flat' }) });
    expect(flatMid[0]!.days).toBeCloseTo(24 * (184 / 365), 1);
  });
  it('distributes the total equally over remaining periods', () => {
    const e = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2026-07-01', tier: tier({ accrual: 'equally_distributed', totalDays: 12 }) });
    expect(e).toHaveLength(6);
    expect(sum(e)).toBe(12);
    expect(computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2027-01-01', tier: tier({ accrual: 'equally_distributed' }) })).toEqual([]);
  });
  it('fixes rounding so totals match', () => {
    const e = computeAccruals({ sessionStart: S, sessionEnd: E, joinDate: '2020-01-01', tier: tier({ totalDays: 10 }) });
    expect(sum(e)).toBe(10);
  });
  it('selects the experience tier', () => {
    const tiers = [tier({ minYearsExperience: 0, totalDays: 12 }), tier({ minYearsExperience: 5, totalDays: 18 })];
    expect(selectTier(tiers, 2)!.totalDays).toBe(12);
    expect(selectTier(tiers, 7)!.totalDays).toBe(18);
    expect(selectTier([], 1)).toBeUndefined();
  });
});

describe('balance and carry-forward', () => {
  it('sums credits less debits as of a date', () => {
    const l = [
      { date: '2026-01-01', days: 2, kind: 'accrual' as const },
      { date: '2026-02-01', days: 2, kind: 'accrual' as const },
      { date: '2026-02-10', days: 1.5, kind: 'taken' as const },
      { date: '2026-03-01', days: 2, kind: 'accrual' as const },
    ];
    expect(leaveBalance(l, '2026-02-28')).toEqual({ balance: 2.5, credited: 4, taken: 1.5, expired: 0 });
    expect(leaveBalance(l, '2026-03-31').balance).toBe(4.5);
  });
  it('lapses expired comp-off credits not yet used', () => {
    const l = [
      { date: '2026-01-05', days: 1, kind: 'comp_off' as const, expiresOn: '2026-02-05' },
      { date: '2026-01-01', days: 2, kind: 'accrual' as const },
      { date: '2026-01-20', days: 1, kind: 'taken' as const },
    ];
    // the taken day consumes the soonest-expiring credit (comp-off) first
    expect(leaveBalance(l, '2026-03-01')).toEqual({ balance: 2, credited: 3, taken: 1, expired: 0 });
    const unused = [l[0]!];
    expect(leaveBalance(unused, '2026-03-01')).toEqual({ balance: 0, credited: 1, taken: 0, expired: 1 });
  });
  it('caps carry-forward', () => {
    expect(carryForward(10, { carryForward: { maxDays: 5 } })).toEqual({ carried: 5, lapsed: 5 });
    expect(carryForward(3, { carryForward: { maxDays: 5 } })).toEqual({ carried: 3, lapsed: 0 });
    expect(carryForward(3, {})).toEqual({ carried: 0, lapsed: 3 });
  });
});

describe('counting leave days', () => {
  // Fri 2026-08-07 to Mon 2026-08-10, weekend between
  const base = { from: '2026-08-07', to: '2026-08-10', holidays: new Set<string>(), nonWorking: [{ weekday: 0 }, { weekday: 6 }] };
  it('excludes sandwiched weekends by default', () => {
    const r = countLeaveDays({ ...base, sandwich: { mode: 'exclude' } });
    expect(r.days).toBe(2);
    expect(r.perDate.find((d) => d.date === '2026-08-08')).toMatchObject({ counted: false, reason: 'non_working' });
  });
  it('includes sandwiched days when configured', () => {
    expect(countLeaveDays({ ...base, sandwich: { mode: 'include' } }).days).toBe(4);
    expect(countLeaveDays({ ...base, sandwich: { mode: 'include_if_exceeds', thresholdDays: 3 } }).days).toBe(4);
    expect(countLeaveDays({ ...base, sandwich: { mode: 'include_if_exceeds', thresholdDays: 5 } }).days).toBe(2);
  });
  it('never counts leading or trailing off days', () => {
    const r = countLeaveDays({ ...base, from: '2026-08-08', to: '2026-08-11', sandwich: { mode: 'include' } });
    expect(r.days).toBe(2);
    expect(r.perDate[0]).toMatchObject({ counted: false });
  });
  it('skips holidays and handles half days and all-off ranges', () => {
    const r = countLeaveDays({ from: '2026-08-12', to: '2026-08-14', holidays: new Set(['2026-08-13']), nonWorking: [], sandwich: { mode: 'exclude' } });
    expect(r.days).toBe(2);
    expect(countLeaveDays({ ...base, from: '2026-08-08', to: '2026-08-09', sandwich: { mode: 'include' } }).days).toBe(0);
    expect(countLeaveDays({ ...base, from: '2026-08-12', to: '2026-08-12', duration: 'first_half', sandwich: { mode: 'exclude' } }).days).toBe(0.5);
  });
});

describe('request validation', () => {
  const r: LeaveRestrictions = {
    allowedDurations: ['full', 'first_half', 'second_half'], pastDaysAllowed: 3, minNoticeDays: 1, maxFutureDays: 90,
    reasonMandatory: true, exceedBalance: 'block',
  };
  const ctx: ValidationContext = { today: '2026-08-10', balance: 5, yearAccrual: 12, applicationsInPeriod: 0, existing: [] };
  const req = { from: '2026-08-20', to: '2026-08-21', duration: 'full' as const, days: 2, reason: 'Family', typeCode: 'CL' };
  const codes = (o = {}, rr = r, c = ctx) => validateLeaveRequest({ ...req, ...o }, rr, c).map((v) => v.code);

  it('accepts a valid request', () => expect(codes()).toEqual([]));
  it('checks dates and notice windows', () => {
    expect(codes({ to: '2026-08-19' })).toContain('invalid_range');
    expect(codes({ from: '2026-08-01', to: '2026-08-01', days: 1 })).toContain('too_far_back');
    expect(codes({ from: '2026-08-10', to: '2026-08-10', days: 1 })).toContain('notice_too_short');
    expect(codes({ from: '2027-01-10', to: '2027-01-10', days: 1 })).toContain('too_far_ahead');
  });
  it('checks durations, gender, reason and attachments', () => {
    expect(codes({ duration: 'first_half', days: 0.5 })).toContain('half_day_single_date');
    expect(codes({ duration: 'first_half', to: '2026-08-20', days: 0.5 }, { ...r, allowedDurations: ['full'] })).toContain('duration_not_allowed');
    expect(codes({}, { ...r, genders: ['female'] }, { ...ctx, gender: 'male' })).toContain('gender_not_eligible');
    expect(codes({}, { ...r, genders: ['female'] }, { ...ctx, gender: 'female' })).not.toContain('gender_not_eligible');
    expect(codes({ reason: ' ' })).toContain('reason_required');
    expect(codes({ days: 4 }, { ...r, attachmentRequiredAfterDays: 3 }, { ...ctx, balance: 10 })).toContain('attachment_required');
    expect(codes({ days: 4, hasAttachment: true }, { ...r, attachmentRequiredAfterDays: 3 }, { ...ctx, balance: 10 })).not.toContain('attachment_required');
  });
  it('checks limits and balance modes', () => {
    expect(codes({ days: 3 }, { ...r, maxDaysPerApplication: 2 })).toContain('max_days_per_application');
    expect(codes({ to: '2026-08-25' }, { ...r, maxConsecutiveDays: 3 })).toContain('max_consecutive_days');
    expect(codes({}, { ...r, maxApplicationsPerPeriod: 2 }, { ...ctx, applicationsInPeriod: 2 })).toContain('max_applications');
    expect(codes({ days: 8 })).toContain('insufficient_balance');
    expect(codes({ days: 8 }, { ...r, exceedBalance: 'allow' })).not.toContain('insufficient_balance');
    expect(codes({ days: 8 }, { ...r, exceedBalance: 'up_to_year_accrual' })).not.toContain('insufficient_balance');
    expect(codes({ days: 13 }, { ...r, exceedBalance: 'up_to_year_accrual' })).toContain('insufficient_balance');
  });
  it('checks overlaps and combination rules', () => {
    const ex = (o = {}) => ({ from: '2026-08-21', to: '2026-08-22', typeCode: 'CL', status: 'approved', ...o });
    expect(codes({}, r, { ...ctx, existing: [ex()] })).toContain('overlap');
    expect(codes({}, r, { ...ctx, existing: [ex({ status: 'rejected' })] })).toEqual([]);
    expect(codes({}, r, { ...ctx, existing: [ex({ typeCode: 'SL' })] })).toEqual([]);
    expect(codes({}, { ...r, cannotCombineWith: ['SL'] }, { ...ctx, existing: [ex({ typeCode: 'SL' })] })).toContain('cannot_combine');
  });
});
