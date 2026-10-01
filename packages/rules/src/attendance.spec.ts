import { describe, expect, it } from 'vitest';
import {
  attendanceDateFor, computeDayFacts, isNightShift, resolveBaseStatus, summarizeRegister,
  shiftWindow, type ShiftTiming,
} from './attendance.js';
import { zonedToUtcMs } from './dates.js';

const day: ShiftTiming = { timezone: 'Asia/Kolkata', startTime: '09:30', maxPunchInTime: '09:45', workingMinutes: 540 };
const night: ShiftTiming = { timezone: 'Asia/Kolkata', startTime: '22:00', workingMinutes: 540 };
const at = (date: string, time: string, tz = 'Asia/Kolkata') => zonedToUtcMs(date, time, tz);

describe('attendance date', () => {
  it('assigns early and late punches to the right day', () => {
    expect(attendanceDateFor(at('2026-08-29', '09:00'), day)).toBe('2026-08-29');
    expect(attendanceDateFor(at('2026-08-29', '23:30'), day)).toBe('2026-08-29');
    expect(attendanceDateFor(at('2026-08-30', '03:00'), day)).toBe('2026-08-29');
  });
  it('keeps a night shift on its start date across midnight', () => {
    expect(isNightShift(night)).toBe(true);
    expect(isNightShift(day)).toBe(false);
    expect(attendanceDateFor(at('2026-08-29', '22:05'), night)).toBe('2026-08-29');
    expect(attendanceDateFor(at('2026-08-30', '01:00'), night)).toBe('2026-08-29');
    expect(attendanceDateFor(at('2026-08-30', '06:30'), night)).toBe('2026-08-29');
    expect(attendanceDateFor(at('2026-08-30', '19:00'), night)).toBe('2026-08-30');
  });
  it('works for tenants in another timezone', () => {
    const ny: ShiftTiming = { timezone: 'America/New_York', startTime: '09:00', workingMinutes: 480 };
    expect(attendanceDateFor(at('2026-08-29', '08:30', 'America/New_York'), ny)).toBe('2026-08-29');
  });
});

describe('day facts', () => {
  const date = '2026-08-29';
  const now = at('2026-08-31', '12:00');
  it('computes late and worked time with breaks', () => {
    const f = computeDayFacts(date, [
      { type: 'in', at: at(date, '09:52') },
      { type: 'out', at: at(date, '18:30') },
    ], day, [{ start: at(date, '13:00'), end: at(date, '13:45') }], now);
    expect(f.lateMinutes).toBe(7);
    expect(f.workedMinutes).toBe(518 - 45);
    expect(f.breakMinutes).toBe(45);
    expect(f.earlyOutMinutes).toBe(0);
    expect(f.missingPunchOut).toBe(false);
  });
  it('reports early out and overtime', () => {
    const early = computeDayFacts(date, [{ type: 'in', at: at(date, '09:30') }, { type: 'out', at: at(date, '17:30') }], day, [], now);
    expect(early.earlyOutMinutes).toBe(60);
    const ot = computeDayFacts(date, [{ type: 'in', at: at(date, '09:30') }, { type: 'out', at: at(date, '20:00') }], day, [], now);
    expect(ot.overtimeMinutes).toBe(90);
  });
  it('detects a missing punch-out only once the window has passed', () => {
    const open = [{ type: 'in' as const, at: at(date, '09:30') }];
    expect(computeDayFacts(date, open, day, [], at(date, '15:00')).missingPunchOut).toBe(false);
    expect(computeDayFacts(date, open, day, [], now).missingPunchOut).toBe(true);
  });
  it('handles several sessions and unsorted input', () => {
    const f = computeDayFacts(date, [
      { type: 'out', at: at(date, '18:00') },
      { type: 'in', at: at(date, '14:00') },
      { type: 'out', at: at(date, '12:00') },
      { type: 'in', at: at(date, '09:30') },
    ], day, [], now);
    expect(f.sessions).toHaveLength(2);
    expect(f.workedMinutes).toBe(150 + 240);
    expect(shiftWindow(date, day).end - shiftWindow(date, day).start).toBe(540 * 60_000);
  });
  it('ignores a stray out punch and duplicate in punches', () => {
    const f = computeDayFacts(date, [
      { type: 'out', at: at(date, '08:00') },
      { type: 'in', at: at(date, '09:30') },
      { type: 'in', at: at(date, '09:40') },
      { type: 'out', at: at(date, '10:30') },
    ], day, [], now);
    expect(f.workedMinutes).toBe(60);
  });
  it('clamps break time to the worked sessions', () => {
    const f = computeDayFacts(date, [{ type: 'in', at: at(date, '09:30') }, { type: 'out', at: at(date, '10:00') }], day,
      [{ start: at(date, '11:00'), end: at(date, '11:30') }], now);
    expect(f.breakMinutes).toBe(0);
    expect(f.workedMinutes).toBe(30);
  });
});

describe('base status', () => {
  const d = '2026-08-12';
  const base = { date: d, hasPunches: false };
  it('orders statuses: not joined, override, holiday, non-working, leave, presence', () => {
    expect(resolveBaseStatus({ ...base, joinDate: '2026-09-01' }).code).toBe('NJ');
    expect(resolveBaseStatus({ ...base, exitDate: '2026-08-01' }).code).toBe('NW');
    expect(resolveBaseStatus({ ...base, override: { code: 'OH' } })).toMatchObject({ code: 'OH', overridden: true });
    expect(resolveBaseStatus({ ...base, override: { code: 'P' } }).code).toBe('AP');
    expect(resolveBaseStatus({ ...base, override: { code: 'AB' } }).code).toBe('OA');
    expect(resolveBaseStatus({ ...base, holiday: true, hasPunches: true })).toMatchObject({ code: 'H', workedOnOffDay: true });
    expect(resolveBaseStatus({ ...base, date: '2026-08-09', nonWorkingRules: [{ weekday: 0 }] }).code).toBe('NW');
    expect(resolveBaseStatus({ ...base, nonWorkingRules: [{ weekday: 0 }] }).code).toBe('AB');
  });
  it('handles leave variants', () => {
    expect(resolveBaseStatus({ ...base, leave: { status: 'approved', paid: true } }).code).toBe('L');
    expect(resolveBaseStatus({ ...base, leave: { status: 'pending', paid: false } }).code).toBe('PUL');
    expect(resolveBaseStatus({ ...base, leave: { status: 'pending', paid: true } }).code).toBe('PA');
    expect(resolveBaseStatus({ ...base, leave: { status: 'approved', paid: true, half: 'first' }, hasPunches: true }))
      .toMatchObject({ code: 'HL', secondary: 'HP', presentUnits: 0.5, leaveUnits: 0.5 });
    expect(resolveBaseStatus({ ...base, leave: { status: 'approved', paid: true, half: 'second' } }))
      .toMatchObject({ code: 'HL', secondary: 'AH', absentUnits: 0.5 });
    expect(resolveBaseStatus({ ...base, leave: { status: 'pending', paid: true, half: 'second' } }).code).toBe('PA');
  });
  it('resolves presence, pending regularization and absence', () => {
    expect(resolveBaseStatus({ ...base, hasPunches: true }).code).toBe('P');
    expect(resolveBaseStatus({ ...base, pendingRegularization: true }).code).toBe('PA');
    expect(resolveBaseStatus(base)).toMatchObject({ code: 'AB', absentUnits: 1 });
  });
});

describe('register summary', () => {
  it('counts the summary columns', () => {
    const s = summarizeRegister([
      { code: 'P' }, { code: 'P', deduction: true }, { code: 'HP' }, { code: 'AB' }, { code: 'OA' }, { code: 'AH' },
      { code: 'L' }, { code: 'PUL' }, { code: 'HL', secondary: 'HP' }, { code: 'HL', secondary: 'AH' },
      { code: 'H' }, { code: 'OH' }, { code: 'PA' }, { code: 'AP' }, { code: 'NW' }, { code: 'ONW' }, { code: 'NJ' }, { code: 'LM' },
    ]);
    expect(s).toEqual({ P: 2, A: 2, L: 2, HL: 2, H: 2, PA: 1, HP: 2, AH: 2, AP: 1, D: 1, NW: 3 });
  });
});
