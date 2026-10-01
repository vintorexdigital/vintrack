/** Calendar and timezone helpers. Dates are 'YYYY-MM-DD' strings so no host timezone leaks in. */

export type DateStr = string;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function parseDate(d: DateStr): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y: y!, m: m!, day: day! };
}

export function fmtDate(y: number, m: number, day: number): DateStr {
  return `${pad(y, 4)}-${pad(m)}-${pad(day)}`;
}

export function toEpochDay(d: DateStr): number {
  const { y, m, day } = parseDate(d);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function fromEpochDay(n: number): DateStr {
  const dt = new Date(n * 86_400_000);
  return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export const addDays = (d: DateStr, n: number): DateStr => fromEpochDay(toEpochDay(d) + n);
export const diffDays = (a: DateStr, b: DateStr): number => toEpochDay(a) - toEpochDay(b);

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: DateStr): number {
  return (((toEpochDay(d) + 4) % 7) + 7) % 7;
}

export function enumerateDates(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let i = toEpochDay(from); i <= toEpochDay(to); i++) out.push(fromEpochDay(i));
  return out;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(d: DateStr, n: number): DateStr {
  const { y, m, day } = parseDate(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return fmtDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** Which occurrence of its weekday within the month this date is (1-based). */
export function weekOfMonth(d: DateStr): number {
  return Math.floor((parseDate(d).day - 1) / 7) + 1;
}

export interface NonWorkingRule {
  weekday: number;
  /** Occurrences within the month, e.g. [2, 4] for 2nd and 4th. Omit for every week. */
  weeks?: number[];
}

export function isNonWorkingDay(d: DateStr, rules: NonWorkingRule[]): boolean {
  const wd = weekday(d);
  const wk = weekOfMonth(d);
  return rules.some((r) => r.weekday === wd && (!r.weeks || r.weeks.includes(wk)));
}

export interface AttendanceCycle {
  start: DateStr;
  end: DateStr;
  label: string;
}

/** The attendance cycle containing `d` for a tenant whose cycle starts on `monthStartDay` (1-28). */
export function attendanceCycle(d: DateStr, monthStartDay = 1): AttendanceCycle {
  const { y, m, day } = parseDate(d);
  let start: DateStr;
  if (monthStartDay <= 1) start = fmtDate(y, m, 1);
  else if (day >= monthStartDay) start = fmtDate(y, m, monthStartDay);
  else start = addMonths(fmtDate(y, m, monthStartDay), -1);
  const end =
    monthStartDay <= 1 ? fmtDate(y, m, daysInMonth(y, m)) : addDays(addMonths(start, 1), -1);
  return { start, end, label: `${start} to ${end}` };
}

/* ---------- timezone ---------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  date: DateStr;
  minutes: number; // minutes since local midnight
  seconds: number;
}

export function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  const h = Number(p.hour);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: h * 60 + Number(p.minute),
    seconds: Number(p.second),
  };
}

function tzOffsetMs(ms: number, tz: string): number {
  const lp = localParts(ms, tz);
  const { y, m, day } = parseDate(lp.date);
  const asUtc = Date.UTC(y, m - 1, day, 0, 0, 0) + lp.minutes * 60_000 + lp.seconds * 1000;
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convert a local wall-clock date and 'HH:mm' in `tz` to UTC epoch milliseconds. */
export function zonedToUtcMs(date: DateStr, time: string, tz: string): number {
  const { y, m, day } = parseDate(date);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh!, mm!, 0);
  let ms = guess - tzOffsetMs(guess, tz);
  ms = guess - tzOffsetMs(ms, tz);
  return ms;
}

export const minutesBetween = (a: number, b: number): number => Math.round((b - a) / 60_000);
