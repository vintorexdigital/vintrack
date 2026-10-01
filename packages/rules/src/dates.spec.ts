import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, attendanceCycle, diffDays, enumerateDates, isNonWorkingDay,
  localParts, weekday, weekOfMonth, zonedToUtcMs, daysInMonth,
} from './dates.js';

describe('dates', () => {
  it('adds days across month and leap boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2026-03-01', '2026-02-01')).toBe(28);
  });
  it('clamps month addition to month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(daysInMonth(2028, 2)).toBe(29);
  });
  it('computes weekday and week of month', () => {
    expect(weekday('2026-08-29')).toBe(6); // Saturday
    expect(weekOfMonth('2026-08-08')).toBe(2);
    expect(enumerateDates('2026-01-30', '2026-02-02')).toHaveLength(4);
  });
  it('matches 2nd and 4th Saturday rules', () => {
    const rules = [{ weekday: 0 }, { weekday: 6, weeks: [2, 4] }];
    expect(isNonWorkingDay('2026-08-09', rules)).toBe(true); // Sunday
    expect(isNonWorkingDay('2026-08-08', rules)).toBe(true); // 2nd Saturday
    expect(isNonWorkingDay('2026-08-01', rules)).toBe(false); // 1st Saturday
    expect(isNonWorkingDay('2026-08-22', rules)).toBe(true); // 4th Saturday
  });
  it('finds attendance cycles for custom start days', () => {
    expect(attendanceCycle('2026-02-10', 26)).toMatchObject({ start: '2026-01-26', end: '2026-02-25' });
    expect(attendanceCycle('2026-02-26', 26)).toMatchObject({ start: '2026-02-26', end: '2026-03-25' });
    expect(attendanceCycle('2026-02-10', 1)).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('converts between zones', () => {
    const ms = zonedToUtcMs('2026-08-29', '09:30', 'Asia/Kolkata');
    expect(new Date(ms).toISOString()).toBe('2026-08-29T04:00:00.000Z');
    expect(localParts(ms, 'Asia/Kolkata')).toMatchObject({ date: '2026-08-29', minutes: 570 });
    const ny = zonedToUtcMs('2026-03-08', '12:00', 'America/New_York'); // DST day
    expect(new Date(ny).toISOString()).toBe('2026-03-08T16:00:00.000Z');
  });
});
