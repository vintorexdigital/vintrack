import {
  type DateStr,
  addDays,
  isNonWorkingDay,
  localParts,
  minutesBetween,
  zonedToUtcMs,
  type NonWorkingRule,
} from './dates.js';

export type AttendanceCode =
  | 'P' | 'HP' | 'AB' | 'AH' | 'L' | 'HL' | 'H' | 'NW' | 'LM' | 'LMP' | 'D'
  | 'AP' | 'PA' | 'PUL' | 'NJ' | 'OA' | 'ONW' | 'OH';

export const ATTENDANCE_CODES: Record<AttendanceCode, { title: string; token: string }> = {
  P: { title: 'Present', token: 'present' },
  HP: { title: 'Half-day present', token: 'present' },
  AB: { title: 'Absent', token: 'absent' },
  AH: { title: 'Absent for half the day', token: 'absent' },
  L: { title: 'Full-day leave', token: 'leave' },
  HL: { title: 'Half-day leave', token: 'leave' },
  H: { title: 'Holiday', token: 'holiday' },
  NW: { title: 'Non-working day', token: 'non-working' },
  LM: { title: 'Late mark', token: 'late' },
  LMP: { title: 'Late mark counted by policy', token: 'late' },
  D: { title: 'Deduction applied by policy', token: 'late' },
  AP: { title: 'Approved present (regularized)', token: 'present' },
  PA: { title: 'Pending approval', token: 'pending' },
  PUL: { title: 'Pending unpaid leave', token: 'pending' },
  NJ: { title: 'Not joined yet', token: 'non-working' },
  OA: { title: 'Overridden to absent', token: 'absent' },
  ONW: { title: 'Overridden to non-working day', token: 'non-working' },
  OH: { title: 'Overridden to holiday', token: 'holiday' },
};

export interface ShiftTiming {
  timezone: string;
  /** 'HH:mm' local start */
  startTime: string;
  /** Late threshold, 'HH:mm' local. Defaults to start time. */
  maxPunchInTime?: string;
  workingMinutes: number;
  breakAllowanceMinutes?: number;
  /** Minutes before shift start that a punch-in is still allowed (and the day boundary). */
  earlyPunchWindowMinutes?: number;
}

export type PunchType = 'in' | 'out';
export interface PunchLite {
  type: PunchType;
  at: number; // epoch ms
}

const DEFAULT_LEAD = 240;

/**
 * Attendance date for an instant. The day boundary sits `lead` minutes before each shift start, so a
 * night shift crossing midnight belongs to the date it started on.
 */
export function attendanceDateFor(instantMs: number, shift: ShiftTiming): DateStr {
  const lead = shift.earlyPunchWindowMinutes ?? DEFAULT_LEAD;
  const lp = localParts(instantMs + lead * 60_000, shift.timezone);
  const [sh, sm] = shift.startTime.split(':').map(Number);
  // The shifted instant is on or after the shift start of its local date => that date owns it.
  return lp.minutes >= sh! * 60 + sm! ? lp.date : addDays(lp.date, -1);
}

export function shiftWindow(date: DateStr, shift: ShiftTiming): { start: number; end: number } {
  const start = zonedToUtcMs(date, shift.startTime, shift.timezone);
  return { start, end: start + shift.workingMinutes * 60_000 };
}

export function isNightShift(shift: ShiftTiming): boolean {
  const [sh, sm] = shift.startTime.split(':').map(Number);
  return sh! * 60 + sm! + shift.workingMinutes > 24 * 60;
}

export interface BreakInterval {
  start: number;
  end: number;
}

export interface DayFacts {
  date: DateStr;
  firstIn: number | null;
  lastOut: number | null;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  missingPunchOut: boolean;
  overtimeMinutes: number;
  sessions: { start: number; end: number | null }[];
}

/** Pair punches into sessions and derive the day's facts. Input need not be sorted. */
export function computeDayFacts(
  date: DateStr,
  punches: PunchLite[],
  shift: ShiftTiming,
  breaks: BreakInterval[] = [],
  now: number = Date.now(),
): DayFacts {
  const sorted = [...punches].sort((a, b) => a.at - b.at);
  const sessions: DayFacts['sessions'] = [];
  for (const p of sorted) {
    const open = sessions[sessions.length - 1];
    if (p.type === 'in') {
      if (!open || open.end !== null) sessions.push({ start: p.at, end: null });
    } else if (open && open.end === null) {
      open.end = p.at;
    }
  }
  const win = shiftWindow(date, shift);
  const firstIn = sessions[0]?.start ?? null;
  const lastSession = sessions[sessions.length - 1];
  const missingPunchOut = !!lastSession && lastSession.end === null && now > win.end + 4 * 3_600_000;
  const lastOut = [...sessions].reverse().find((s) => s.end !== null)?.end ?? null;

  let worked = 0;
  for (const s of sessions) {
    const end = s.end ?? (missingPunchOut ? s.start : Math.min(now, win.end + 4 * 3_600_000));
    if (end > s.start) worked += minutesBetween(s.start, end);
  }
  let breakMinutes = 0;
  for (const b of breaks) {
    const overlap = sessions.reduce((acc, s) => {
      const e = s.end ?? b.end;
      const lo = Math.max(b.start, s.start);
      const hi = Math.min(b.end, e);
      return acc + Math.max(0, hi - lo);
    }, 0);
    breakMinutes += Math.round(overlap / 60_000);
  }
  worked = Math.max(0, worked - breakMinutes);

  const lateThreshold = zonedToUtcMs(date, shift.maxPunchInTime ?? shift.startTime, shift.timezone);
  const lateMinutes = firstIn !== null && firstIn > lateThreshold ? minutesBetween(lateThreshold, firstIn) : 0;
  const earlyOutMinutes =
    lastOut !== null && lastOut < win.end && !missingPunchOut ? minutesBetween(lastOut, win.end) : 0;
  const overtimeMinutes = lastOut !== null && lastOut > win.end ? minutesBetween(win.end, lastOut) : 0;

  return {
    date,
    firstIn,
    lastOut,
    workedMinutes: worked,
    breakMinutes,
    lateMinutes,
    earlyOutMinutes,
    missingPunchOut,
    overtimeMinutes,
    sessions,
  };
}

export type HalfDay = 'first' | 'second';

export interface DayContext {
  date: DateStr;
  joinDate?: DateStr | null;
  exitDate?: DateStr | null;
  holiday?: boolean;
  nonWorkingRules?: NonWorkingRule[];
  /** Approved or pending leave on this date. */
  leave?: { status: 'approved' | 'pending'; paid: boolean; half?: HalfDay } | null;
  override?: { code: 'OA' | 'ONW' | 'OH' | 'AP' | 'P' | 'AB' | 'HP' } | null;
  pendingRegularization?: boolean;
  hasPunches: boolean;
}

export interface DayBase {
  code: AttendanceCode;
  secondary?: AttendanceCode;
  presentUnits: number;
  absentUnits: number;
  leaveUnits: number;
  offDay: boolean;
  overridden: boolean;
  /** True when the employee worked on a holiday or non-working day (comp-off candidate). */
  workedOnOffDay: boolean;
}

const unitsFor = (code: AttendanceCode) => ({
  presentUnits: code === 'P' || code === 'AP' ? 1 : code === 'HP' ? 0.5 : 0,
  absentUnits: code === 'AB' || code === 'OA' ? 1 : code === 'AH' ? 0.5 : 0,
  leaveUnits: code === 'L' || code === 'PUL' ? 1 : code === 'HL' ? 0.5 : 0,
});

/** First-pass status before policies run. */
export function resolveBaseStatus(ctx: DayContext): DayBase {
  const mk = (code: AttendanceCode, extra: Partial<DayBase> = {}): DayBase => ({
    code,
    ...unitsFor(code),
    offDay: code === 'H' || code === 'NW' || code === 'NJ' || code === 'OH' || code === 'ONW',
    overridden: false,
    workedOnOffDay: false,
    ...extra,
  });

  if (ctx.joinDate && ctx.date < ctx.joinDate) return mk('NJ');
  if (ctx.exitDate && ctx.date > ctx.exitDate) return mk('NW');

  if (ctx.override) {
    const c = ctx.override.code;
    return mk(c === 'P' ? 'AP' : c === 'AB' ? 'OA' : c, { overridden: true });
  }
  if (ctx.holiday) return mk('H', { workedOnOffDay: ctx.hasPunches });
  if (ctx.nonWorkingRules && isNonWorkingDay(ctx.date, ctx.nonWorkingRules)) {
    return mk('NW', { workedOnOffDay: ctx.hasPunches });
  }

  if (ctx.leave) {
    const { status, paid, half } = ctx.leave;
    if (!half) {
      if (status === 'pending') return mk(paid ? 'PA' : 'PUL');
      return mk('L');
    }
    // Half-day leave: the other half depends on presence.
    if (status === 'pending') return mk('PA');
    return ctx.hasPunches
      ? mk('HL', { secondary: 'HP', presentUnits: 0.5, leaveUnits: 0.5 })
      : mk('HL', { secondary: 'AH', absentUnits: 0.5, leaveUnits: 0.5 });
  }

  if (ctx.hasPunches) return mk('P');
  if (ctx.pendingRegularization) return mk('PA');
  return mk('AB');
}

export interface RegisterSummary {
  P: number; A: number; L: number; HL: number; H: number; PA: number;
  HP: number; AH: number; AP: number; D: number; NW: number;
}

export interface RegisterCell {
  code: AttendanceCode;
  secondary?: AttendanceCode;
  deduction?: boolean;
  lateMark?: boolean;
}

export function summarizeRegister(cells: RegisterCell[]): RegisterSummary {
  const s: RegisterSummary = { P: 0, A: 0, L: 0, HL: 0, H: 0, PA: 0, HP: 0, AH: 0, AP: 0, D: 0, NW: 0 };
  for (const c of cells) {
    switch (c.code) {
      case 'P': s.P++; break;
      case 'HP': s.HP++; break;
      case 'AB': case 'OA': s.A++; break;
      case 'AH': s.AH++; break;
      case 'L': case 'PUL': s.L++; break;
      case 'HL': s.HL++; if (c.secondary === 'HP') s.HP++; if (c.secondary === 'AH') s.AH++; break;
      case 'H': case 'OH': s.H++; break;
      case 'PA': s.PA++; break;
      case 'AP': s.AP++; break;
      case 'NW': case 'ONW': case 'NJ': s.NW++; break;
      default: break;
    }
    if (c.deduction) s.D++;
  }
  return s;
}
