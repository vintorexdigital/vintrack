import { addDays, localParts, weekday, zonedToUtcMs } from './dates.js';

export interface Recurrence {
  frequency: 'daily' | 'weekly' | 'monthly';
  /** 0 = Sunday. */
  weekday: number;
  /** 1 to 28, so every month has the day. */
  dayOfMonth: number;
  /** Local hour, 0 to 23. */
  hour: number;
}

/** The first time strictly after `afterMs` that the recurrence fires, in the company's timezone, as UTC milliseconds. */
export function nextRun(r: Recurrence, afterMs: number, tz: string): number {
  const time = `${String(r.hour).padStart(2, '0')}:00`;
  let date = localParts(afterMs, tz).date;
  for (let i = 0; i < 400; i++) {
    const day = Number(date.slice(8, 10));
    const fits = r.frequency === 'daily' || (r.frequency === 'weekly' && weekday(date) === r.weekday) || (r.frequency === 'monthly' && day === r.dayOfMonth);
    if (fits) {
      const at = zonedToUtcMs(date, time, tz);
      if (at > afterMs) return at;
    }
    date = addDays(date, 1);
  }
  throw new Error('No next run found.');
}
