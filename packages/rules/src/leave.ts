import {
  type DateStr,
  type NonWorkingRule,
  addDays,
  addMonths,
  diffDays,
  enumerateDates,
  isNonWorkingDay,
} from './dates.js';

export type AccrualMode = 'monthly' | 'quarterly' | 'half_yearly' | 'flat' | 'equally_distributed';

export interface EntitlementTier {
  minYearsExperience: number;
  effectiveAfterMonths: number;
  creditTiming: 'start' | 'end';
  accrual: AccrualMode;
  totalDays: number;
  proration: 'daily' | 'none';
  carryForward?: { maxDays: number; expiryDays?: number };
}

export type LedgerKind = 'accrual' | 'carry_forward' | 'adjustment' | 'taken' | 'lapse' | 'comp_off';

export interface LedgerEntry {
  date: DateStr;
  /** Positive for credits and debits alike; `kind` decides direction. */
  days: number;
  kind: LedgerKind;
  expiresOn?: DateStr;
  ref?: string;
}

const isDebit = (k: LedgerKind) => k === 'taken' || k === 'lapse';
const round2 = (n: number) => Math.round(n * 100) / 100;

export function selectTier(tiers: EntitlementTier[], yearsOfExperience: number): EntitlementTier | undefined {
  return [...tiers]
    .sort((a, b) => b.minYearsExperience - a.minYearsExperience)
    .find((t) => yearsOfExperience >= t.minYearsExperience);
}

function periodsOf(sessionStart: DateStr, sessionEnd: DateStr, accrual: AccrualMode) {
  const step = accrual === 'quarterly' ? 3 : accrual === 'half_yearly' ? 6 : accrual === 'flat' ? 12 : 1;
  const out: { start: DateStr; end: DateStr }[] = [];
  let start = sessionStart;
  while (start <= sessionEnd) {
    const next = addMonths(start, step);
    const end = addDays(next, -1) > sessionEnd ? sessionEnd : addDays(next, -1);
    out.push({ start, end });
    start = next;
  }
  return out;
}

export interface AccrualInput {
  sessionStart: DateStr;
  sessionEnd: DateStr;
  joinDate: DateStr;
  tier: EntitlementTier;
}

/** Credits owed for a whole session; callers filter by credit date to get "accrued so far". */
export function computeAccruals({ sessionStart, sessionEnd, joinDate, tier }: AccrualInput): LedgerEntry[] {
  const eligibleFrom = addMonths(joinDate, tier.effectiveAfterMonths);
  const periods = periodsOf(sessionStart, sessionEnd, tier.accrual);
  const entries: LedgerEntry[] = [];

  if (tier.accrual === 'equally_distributed') {
    const eligible = periods.filter((p) => p.end >= eligibleFrom);
    const each = eligible.length ? tier.totalDays / eligible.length : 0;
    for (const p of eligible) {
      const credit = tier.creditTiming === 'start' ? p.start : p.end;
      entries.push({ date: credit < eligibleFrom ? eligibleFrom : credit, days: round2(each), kind: 'accrual' });
    }
    return fixRounding(entries, tier.totalDays);
  }

  const perPeriod = tier.totalDays / periods.length;
  for (const p of periods) {
    if (p.end < eligibleFrom) continue;
    const len = diffDays(p.end, p.start) + 1;
    const from = eligibleFrom > p.start ? eligibleFrom : p.start;
    const fraction = tier.proration === 'daily' ? (diffDays(p.end, from) + 1) / len : 1;
    const credit = tier.creditTiming === 'start' ? p.start : p.end;
    const days = round2(perPeriod * fraction);
    if (days > 0) entries.push({ date: credit < eligibleFrom ? eligibleFrom : credit, days, kind: 'accrual' });
  }
  const fullSession = entries.length === periods.length && eligibleFrom <= sessionStart;
  return fullSession ? fixRounding(entries, tier.totalDays) : entries;
}

function fixRounding(entries: LedgerEntry[], target: number): LedgerEntry[] {
  if (!entries.length) return entries;
  const sum = round2(entries.reduce((s, e) => s + e.days, 0));
  const last = entries[entries.length - 1]!;
  last.days = round2(last.days + (target - sum));
  return entries;
}

export interface BalanceResult {
  balance: number;
  credited: number;
  taken: number;
  expired: number;
}

/** FIFO by expiry: debits consume the soonest-expiring credits first; unused expired credits lapse. */
export function leaveBalance(ledger: LedgerEntry[], asOf: DateStr): BalanceResult {
  const credits = ledger
    .filter((e) => !isDebit(e.kind) && e.date <= asOf)
    .map((e) => ({ remaining: e.days, expiresOn: e.expiresOn }))
    .sort((a, b) => (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31'));
  let debit = ledger.filter((e) => isDebit(e.kind) && e.date <= asOf).reduce((s, e) => s + e.days, 0);
  const taken = ledger.filter((e) => e.kind === 'taken' && e.date <= asOf).reduce((s, e) => s + e.days, 0);
  const credited = credits.reduce((s, c) => s + c.remaining, 0);
  for (const c of credits) {
    const use = Math.min(c.remaining, debit);
    c.remaining -= use;
    debit -= use;
  }
  let expired = 0;
  let balance = 0;
  for (const c of credits) {
    if (c.expiresOn && c.expiresOn < asOf) expired += c.remaining;
    else balance += c.remaining;
  }
  return { balance: round2(balance - debit), credited: round2(credited), taken: round2(taken), expired: round2(expired) };
}

export function carryForward(balance: number, tier: Pick<EntitlementTier, 'carryForward'>) {
  const cap = tier.carryForward?.maxDays ?? 0;
  const carried = Math.max(0, Math.min(balance, cap));
  return { carried: round2(carried), lapsed: round2(Math.max(0, balance - carried)) };
}

/* ---------- counting days ---------- */

export type SandwichMode = 'exclude' | 'include' | 'include_if_exceeds';
export type LeaveDuration = 'full' | 'first_half' | 'second_half';

export interface CountInput {
  from: DateStr;
  to: DateStr;
  duration?: LeaveDuration;
  holidays: ReadonlySet<DateStr>;
  nonWorking: NonWorkingRule[];
  sandwich: { mode: SandwichMode; thresholdDays?: number };
}

export interface CountedDay {
  date: DateStr;
  units: number;
  counted: boolean;
  reason?: 'holiday' | 'non_working' | 'sandwiched';
}

export function countLeaveDays(input: CountInput): { days: number; perDate: CountedDay[] } {
  const { from, to, holidays, nonWorking, sandwich } = input;
  const duration = input.duration ?? 'full';
  if (duration !== 'full') {
    return { days: 0.5, perDate: [{ date: from, units: 0.5, counted: true }] };
  }
  const dates = enumerateDates(from, to);
  const off = dates.map((d) => (holidays.has(d) ? 'holiday' : isNonWorkingDay(d, nonWorking) ? 'non_working' : null));
  const firstWork = off.findIndex((o) => o === null);
  const lastWork = off.length - 1 - [...off].reverse().findIndex((o) => o === null);
  const span = dates.length;
  const includeInterior =
    sandwich.mode === 'include' || (sandwich.mode === 'include_if_exceeds' && span > (sandwich.thresholdDays ?? 3));
  const perDate: CountedDay[] = dates.map((date, i) => {
    const o = off[i];
    if (o === null) return { date, units: 1, counted: true };
    const interior = firstWork >= 0 && i > firstWork && i < lastWork;
    if (interior && includeInterior) return { date, units: 1, counted: true, reason: 'sandwiched' };
    return { date, units: 0, counted: false, reason: o! };
  });
  return { days: perDate.reduce((s, d) => s + d.units, 0), perDate };
}

/* ---------- request validation ---------- */

export interface LeaveRestrictions {
  allowedDurations: LeaveDuration[];
  pastDaysAllowed: number;
  minNoticeDays: number;
  maxFutureDays: number;
  genders?: string[];
  reasonMandatory: boolean;
  attachmentRequiredAfterDays?: number;
  maxDaysPerApplication?: number;
  maxConsecutiveDays?: number;
  maxApplicationsPerPeriod?: number;
  exceedBalance: 'block' | 'allow' | 'up_to_year_accrual';
  cannotCombineWith?: string[];
}

export interface LeaveRequestInput {
  from: DateStr;
  to: DateStr;
  duration: LeaveDuration;
  days: number;
  reason?: string;
  hasAttachment?: boolean;
  typeCode: string;
}

export interface ValidationContext {
  today: DateStr;
  balance: number;
  yearAccrual: number;
  gender?: string;
  applicationsInPeriod: number;
  existing: { from: DateStr; to: DateStr; typeCode: string; status: string }[];
}

export interface RuleViolation {
  code: string;
  message: string;
}

export function validateLeaveRequest(
  req: LeaveRequestInput,
  r: LeaveRestrictions,
  ctx: ValidationContext,
): RuleViolation[] {
  const v: RuleViolation[] = [];
  const add = (code: string, message: string) => v.push({ code, message });

  if (req.to < req.from) add('invalid_range', 'The end date is before the start date.');
  if (!r.allowedDurations.includes(req.duration)) add('duration_not_allowed', 'This leave type does not allow that duration.');
  if (req.duration !== 'full' && req.from !== req.to) add('half_day_single_date', 'Half-day leave applies to a single date.');
  if (r.genders && r.genders.length && ctx.gender && !r.genders.includes(ctx.gender)) {
    add('gender_not_eligible', 'This leave type is not available for your profile.');
  }
  const back = diffDays(ctx.today, req.from);
  if (back > r.pastDaysAllowed) add('too_far_back', `You can apply at most ${r.pastDaysAllowed} days back.`);
  const ahead = diffDays(req.from, ctx.today);
  if (ahead >= 0 && ahead < r.minNoticeDays) add('notice_too_short', `Apply at least ${r.minNoticeDays} days ahead.`);
  if (ahead > r.maxFutureDays) add('too_far_ahead', `You can apply at most ${r.maxFutureDays} days ahead.`);
  if (r.reasonMandatory && !req.reason?.trim()) add('reason_required', 'A reason is required.');
  if (r.attachmentRequiredAfterDays !== undefined && req.days > r.attachmentRequiredAfterDays && !req.hasAttachment) {
    add('attachment_required', `Attach a document for leave longer than ${r.attachmentRequiredAfterDays} days.`);
  }
  if (r.maxDaysPerApplication !== undefined && req.days > r.maxDaysPerApplication) {
    add('max_days_per_application', `At most ${r.maxDaysPerApplication} days per application.`);
  }
  if (r.maxConsecutiveDays !== undefined && diffDays(req.to, req.from) + 1 > r.maxConsecutiveDays) {
    add('max_consecutive_days', `At most ${r.maxConsecutiveDays} consecutive days.`);
  }
  if (r.maxApplicationsPerPeriod !== undefined && ctx.applicationsInPeriod >= r.maxApplicationsPerPeriod) {
    add('max_applications', `You have used all ${r.maxApplicationsPerPeriod} applications for this period.`);
  }
  const limit = r.exceedBalance === 'allow' ? Infinity : r.exceedBalance === 'up_to_year_accrual' ? ctx.yearAccrual : ctx.balance;
  if (req.days > limit) {
    add('insufficient_balance', `Balance is ${ctx.balance} days; this request needs ${req.days}.`);
  }
  for (const e of ctx.existing) {
    if (e.status === 'rejected' || e.status === 'cancelled') continue;
    const overlaps = req.from <= e.to && req.to >= e.from;
    if (overlaps && e.typeCode === req.typeCode && req.duration === 'full') add('overlap', 'You already have leave on these dates.');
    else if (overlaps && r.cannotCombineWith?.includes(e.typeCode)) {
      add('cannot_combine', `This type cannot be combined with ${e.typeCode}.`);
    }
  }
  return v;
}
