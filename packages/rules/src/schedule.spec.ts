import { describe, expect, it } from 'vitest';
import { nextRun } from './schedule.js';
import { zonedToUtcMs } from './dates.js';

const IST = 'Asia/Kolkata';
const at = (d: string, t: string) => zonedToUtcMs(d, t, IST);

describe('nextRun', () => {
  it('daily: later today if the hour has not come, otherwise tomorrow', () => {
    const r = { frequency: 'daily', weekday: 1, dayOfMonth: 1, hour: 8 } as const;
    expect(nextRun(r, at('2026-03-10', '06:30'), IST)).toBe(at('2026-03-10', '08:00'));
    expect(nextRun(r, at('2026-03-10', '08:00'), IST)).toBe(at('2026-03-11', '08:00'));
    expect(nextRun(r, at('2026-03-10', '23:59'), IST)).toBe(at('2026-03-11', '08:00'));
  });
  it('weekly: the next chosen weekday (Monday = 1)', () => {
    const r = { frequency: 'weekly', weekday: 1, dayOfMonth: 1, hour: 9 } as const;
    expect(nextRun(r, at('2026-03-10', '12:00'), IST)).toBe(at('2026-03-16', '09:00')); // 2026-03-10 is a Tuesday
    expect(nextRun(r, at('2026-03-16', '08:00'), IST)).toBe(at('2026-03-16', '09:00'));
    expect(nextRun(r, at('2026-03-16', '09:30'), IST)).toBe(at('2026-03-23', '09:00'));
  });
  it('monthly: the chosen day, rolling over month and year', () => {
    const r = { frequency: 'monthly', weekday: 1, dayOfMonth: 5, hour: 7 } as const;
    expect(nextRun(r, at('2026-03-04', '12:00'), IST)).toBe(at('2026-03-05', '07:00'));
    expect(nextRun(r, at('2026-03-05', '07:30'), IST)).toBe(at('2026-04-05', '07:00'));
    expect(nextRun(r, at('2026-12-20', '07:30'), IST)).toBe(at('2027-01-05', '07:00'));
  });
  it('uses the company timezone, not the server\'s', () => {
    const r = { frequency: 'daily', weekday: 1, dayOfMonth: 1, hour: 8 } as const;
    // 8:00 in New York is 12:00 or 13:00 UTC depending on daylight saving
    const ny = nextRun(r, Date.UTC(2026, 0, 15, 0, 0), 'America/New_York');
    expect(new Date(ny).toISOString()).toBe('2026-01-15T13:00:00.000Z');
    const summer = nextRun(r, Date.UTC(2026, 6, 15, 0, 0), 'America/New_York');
    expect(new Date(summer).toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});
