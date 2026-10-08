import type { AttendanceCode, DayBase, DayFacts } from './attendance.js';

export type Consequence = 'late_mark' | 'half_day' | 'full_day' | 'flag';

export type PolicyRule =
  | { type: 'late_punch_in'; graceMinutes: number; afterMarks: number; consequence: Exclude<Consequence, 'flag'> }
  | { type: 'early_punch_out'; thresholdMinutes: number; afterMarks: number; consequence: Exclude<Consequence, 'flag'> }
  | { type: 'min_hours'; halfDayBelowMinutes: number; absentBelowMinutes: number }
  | { type: 'productivity'; minProductiveMinutes: number; consequence: 'half_day' | 'flag' }
  | { type: 'task_completion'; minTasks: number; consequence: 'half_day' | 'flag' }
  | { type: 'missing_punch_out'; treatment: 'auto_punch_out' | 'half_day' | 'pending_regularization' }
  | { type: 'overtime'; thresholdMinutes: number };

export interface PolicyContext {
  /** Late marks already recorded earlier in the same attendance cycle. */
  lateMarksBefore: number;
  earlyMarksBefore: number;
  productiveMinutes?: number;
  completedTasks?: number;
}

export interface PolicyOutcome {
  code: AttendanceCode;
  secondary?: AttendanceCode;
  presentUnits: number;
  absentUnits: number;
  leaveUnits: number;
  /** Loss-of-pay days produced by policy deductions. */
  deductionUnits: number;
  lateMark: boolean;
  earlyMark: boolean;
  lateByPolicy: boolean;
  flags: string[];
  overtimeMinutes: number;
  lateMarksAfter: number;
  earlyMarksAfter: number;
  explanation: string[];
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/**
 * Apply an ordered list of published policy rules to a day. Pure: the same inputs always give the
 * same outcome, and every adjustment adds a plain-language line to `explanation`.
 */
export function evaluatePolicy(
  base: DayBase,
  facts: DayFacts,
  rules: PolicyRule[],
  ctx: PolicyContext,
): PolicyOutcome {
  const out: PolicyOutcome = {
    code: base.code,
    ...(base.secondary ? { secondary: base.secondary } : {}),
    presentUnits: base.presentUnits,
    absentUnits: base.absentUnits,
    leaveUnits: base.leaveUnits,
    deductionUnits: 0,
    lateMark: false,
    earlyMark: false,
    lateByPolicy: false,
    flags: [],
    overtimeMinutes: 0,
    lateMarksAfter: ctx.lateMarksBefore,
    earlyMarksAfter: ctx.earlyMarksBefore,
    explanation: [],
  };

  // Policies only act on days where the employee was expected to work and did.
  const worked = base.code === 'P' || base.code === 'AP' || (base.code === 'HL' && base.secondary === 'HP');
  if (!worked || base.overridden) return out;

  const downgrade = (to: 'HP' | 'AH', why: string) => {
    if (out.code === 'P') {
      if (to === 'HP') {
        out.code = 'HP';
        out.presentUnits = 0.5;
        out.absentUnits = 0;
      } else {
        out.code = 'AH';
        out.presentUnits = 0;
        out.absentUnits = 0.5;
      }
      out.explanation.push(why);
    }
  };
  const markDeduction = (units: number) => {
    out.deductionUnits = Math.min(1, out.deductionUnits + units);
  };

  for (const rule of rules) {
    switch (rule.type) {
      case 'missing_punch_out': {
        if (!facts.missingPunchOut) break;
        if (rule.treatment === 'half_day') {
          downgrade('HP', 'Missing punch-out; counted as a half day.');
          out.flags.push('missing_punch_out');
        } else if (rule.treatment === 'pending_regularization') {
          out.code = 'PA';
          out.presentUnits = 0;
          out.explanation.push('Missing punch-out; waiting for regularization.');
          out.flags.push('missing_punch_out');
          return out;
        } else {
          out.explanation.push('Missing punch-out; auto punch-out applied at shift end.');
          out.flags.push('auto_punch_out');
        }
        break;
      }
      case 'late_punch_in': {
        if (facts.lateMinutes <= rule.graceMinutes) break;
        const nth = ctx.lateMarksBefore + 1;
        out.lateMark = true;
        out.lateMarksAfter = nth;
        const lead = `Late by ${facts.lateMinutes} min; ${ordinal(nth)} late mark this cycle`;
        if (nth < rule.afterMarks) {
          out.explanation.push(`${lead}.`);
          break;
        }
        out.lateByPolicy = true;
        applyConsequence(rule.consequence, lead, 'late');
        break;
      }
      case 'early_punch_out': {
        if (facts.earlyOutMinutes <= rule.thresholdMinutes) break;
        const nth = ctx.earlyMarksBefore + 1;
        out.earlyMark = true;
        out.earlyMarksAfter = nth;
        const lead = `Left ${facts.earlyOutMinutes} min early; ${ordinal(nth)} early-out mark this cycle`;
        if (nth < rule.afterMarks) {
          out.explanation.push(`${lead}.`);
          break;
        }
        applyConsequence(rule.consequence, lead, 'early');
        break;
      }
      case 'min_hours': {
        if (facts.missingPunchOut) break;
        if (facts.workedMinutes < rule.absentBelowMinutes) {
          out.code = 'AB';
          out.presentUnits = 0;
          out.absentUnits = 1;
          out.explanation.push(
            `Worked ${facts.workedMinutes} min, below the ${rule.absentBelowMinutes} min needed; marked absent.`,
          );
          return out;
        }
        if (facts.workedMinutes < rule.halfDayBelowMinutes) {
          downgrade('HP', `Worked ${facts.workedMinutes} min, below ${rule.halfDayBelowMinutes} min; half day.`);
        }
        break;
      }
      case 'productivity': {
        if (ctx.productiveMinutes === undefined || ctx.productiveMinutes >= rule.minProductiveMinutes) break;
        const why = `Productive time ${ctx.productiveMinutes} min is below ${rule.minProductiveMinutes} min.`;
        if (rule.consequence === 'half_day') downgrade('HP', `${why} Half day.`);
        else {
          out.flags.push('low_productivity');
          out.explanation.push(`${why} Flagged.`);
        }
        break;
      }
      case 'task_completion': {
        if (ctx.completedTasks === undefined || ctx.completedTasks >= rule.minTasks) break;
        const why = `Completed ${ctx.completedTasks} of ${rule.minTasks} required tasks.`;
        if (rule.consequence === 'half_day') downgrade('HP', `${why} Half day.`);
        else {
          out.flags.push('low_task_completion');
          out.explanation.push(`${why} Flagged.`);
        }
        break;
      }
      case 'overtime': {
        const ot = facts.overtimeMinutes - rule.thresholdMinutes;
        if (ot > 0) {
          out.overtimeMinutes = ot;
          out.explanation.push(`Overtime ${ot} min.`);
        }
        break;
      }
    }
  }
  return out;

  function applyConsequence(c: Exclude<Consequence, 'flag'>, lead: string, kind: 'late' | 'early') {
    if (c === 'late_mark') {
      out.explanation.push(`${lead}; counted as a late mark.`);
    } else if (c === 'half_day') {
      markDeduction(0.5);
      out.explanation.push(`${lead}; half day deducted.`);
    } else {
      markDeduction(1);
      out.explanation.push(`${lead}; full day deducted.`);
    }
    out.flags.push(kind === 'late' ? 'late_by_policy' : 'early_by_policy');
  }
}

/**
 * Cycle-level roll-up for payroll: payable days = present + paid leave + off days - deductions.
 */
export function payableDays(
  days: { presentUnits: number; leaveUnits: number; paidLeave: boolean; offDay: boolean; deductionUnits: number }[],
): number {
  let total = 0;
  for (const d of days) {
    total += d.presentUnits;
    if (d.paidLeave) total += d.leaveUnits;
    if (d.offDay) total += 1;
    total -= d.deductionUnits;
  }
  return Math.max(0, Math.round(total * 100) / 100);
}
