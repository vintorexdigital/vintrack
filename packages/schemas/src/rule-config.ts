import { z } from 'zod';
import { hhmm, uuid } from './common.js';

const platform = z.enum(['mobile', 'desktop', 'web']);
const tri = z.enum(['off', 'optional', 'mandatory']);

/** Everything a working shift can restrict. Defaults make an empty object a permissive shift. */
export const shiftRulesSchema = z.object({
  platforms: z.object({
    punchSources: z.array(platform).default(['mobile', 'desktop', 'web']),
    loginPlatforms: z.array(platform).default(['mobile', 'desktop', 'web']),
    breakPlatforms: z.array(platform).default(['mobile', 'desktop', 'web']),
  }).default({ punchSources: ['mobile', 'desktop', 'web'], loginPlatforms: ['mobile', 'desktop', 'web'], breakPlatforms: ['mobile', 'desktop', 'web'] }),
  autoPunchOut: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['hours', 'clock']).default('hours'),
    hours: z.number().min(1).max(24).default(12),
    clockTime: hhmm.default('23:59'),
    blockAfter: z.boolean().default(true),
  }).default({ enabled: false, mode: 'hours', hours: 12, clockTime: '23:59', blockAfter: true }),
  regularization: z.object({
    enabled: z.boolean().default(true),
    daysBack: z.number().int().min(0).max(90).default(7),
    approvalRequired: z.boolean().default(true),
  }).default({ enabled: true, daysBack: 7, approvalRequired: true }),
  punch: z.object({
    blockEarlyMinutes: z.number().int().min(0).max(720).nullable().default(null),
    blockAfterMaxPunchIn: z.boolean().default(false),
    commentOnIn: z.boolean().default(false),
    commentOnOut: z.boolean().default(false),
    ipAllowlist: z.array(z.string().max(60)).max(50).default([]),
    blockAtHome: z.object({ enabled: z.boolean().default(false), radiusMeters: z.number().min(10).max(5000).default(200) }).default({ enabled: false, radiusMeters: 200 }),
    selfie: tri.default('off'),
    location: tri.default('optional'),
    watermarkDateTime: z.boolean().default(true),
    watermarkAddress: z.boolean().default(true),
    allowAppWithoutProof: z.boolean().default(false),
    fencesIn: z.array(uuid).max(50).default([]),
    fencesOut: z.array(uuid).max(50).default([]),
  }).default({
    blockEarlyMinutes: null, blockAfterMaxPunchIn: false, commentOnIn: false, commentOnOut: false, ipAllowlist: [],
    blockAtHome: { enabled: false, radiusMeters: 200 }, selfie: 'off', location: 'optional', watermarkDateTime: true,
    watermarkAddress: true, allowAppWithoutProof: false, fencesIn: [], fencesOut: [],
  }),
  timesheet: z.object({
    hidePastBreaks: z.boolean().default(false),
    hidePastActivities: z.boolean().default(false),
    blockPunchInUntilSubmitted: z.boolean().default(false),
  }).default({ hidePastBreaks: false, hidePastActivities: false, blockPunchInUntilSubmitted: false }),
  mobile: z.object({
    deviceBinding: z.boolean().default(false),
    biometric: z.enum(['off', 'enabled', 'forced']).default('off'),
    requirePunchInBeforeUse: z.boolean().default(false),
    requireCheckoutBeforePunchOut: z.boolean().default(false),
    requirePunchOutBeforeLogout: z.boolean().default(false),
  }).default({ deviceBinding: false, biometric: 'off', requirePunchInBeforeUse: false, requireCheckoutBeforePunchOut: false, requirePunchOutBeforeLogout: false }),
  computer: z.object({
    autoPunchIn: z.boolean().default(false),
    autoPunchOutOnShutdown: z.boolean().default(false),
    lockMinutes: z.number().int().min(5).max(480).default(60),
  }).default({ autoPunchIn: false, autoPunchOutOnShutdown: false, lockMinutes: 60 }),
});
export type ShiftRules = z.infer<typeof shiftRulesSchema>;

const sandwich = z.object({ mode: z.enum(['exclude', 'include', 'include_if_exceeds']).default('exclude'), thresholdDays: z.number().int().min(1).max(30).default(3) });

export const entitlementTierSchema = z.object({
  minYearsExperience: z.number().min(0).max(60).default(0),
  effectiveAfterMonths: z.number().int().min(0).max(60).default(0),
  creditTiming: z.enum(['start', 'end']).default('start'),
  accrual: z.enum(['monthly', 'quarterly', 'half_yearly', 'flat', 'equally_distributed']).default('monthly'),
  totalDays: z.number().min(0).max(366),
  proration: z.enum(['daily', 'none']).default('daily'),
  carryForward: z.object({ maxDays: z.number().min(0).max(366), expiryDays: z.number().int().min(1).max(730).optional() }).optional(),
});

export const entitlementSchema = z.object({
  tiers: z.array(entitlementTierSchema).min(1).max(10),
  flexible: z.boolean().default(false),
  compOff: z.object({ enabled: z.boolean().default(false), expiryDays: z.number().int().min(1).max(365).default(60) }).default({ enabled: false, expiryDays: 60 }),
  encashable: z.boolean().default(false),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const restrictionsSchema = z.object({
  allowedDurations: z.array(z.enum(['full', 'first_half', 'second_half'])).min(1).default(['full', 'first_half', 'second_half']),
  sandwich: sandwich.default({ mode: 'exclude', thresholdDays: 3 }),
  exceedBalance: z.enum(['block', 'allow', 'up_to_year_accrual']).default('block'),
  pastDaysAllowed: z.number().int().min(0).max(365).default(0),
  minNoticeDays: z.number().int().min(0).max(365).default(0),
  maxFutureDays: z.number().int().min(0).max(730).default(365),
  genders: z.array(z.enum(['female', 'male', 'other'])).default([]),
  reasonMandatory: z.boolean().default(false),
  attachmentRequiredAfterDays: z.number().min(0).max(365).optional(),
  maxDaysPerApplication: z.number().min(0.5).max(366).optional(),
  maxConsecutiveDays: z.number().int().min(1).max(366).optional(),
  maxApplicationsPerPeriod: z.number().int().min(1).max(365).optional(),
  cannotCombineWith: z.array(z.string().max(20)).default([]),
  autoApprove: z.boolean().default(false),
  showToEmployees: z.boolean().default(true),
});
export type LeaveRestrictionsConfig = z.infer<typeof restrictionsSchema>;

const consequence = z.enum(['late_mark', 'half_day', 'full_day']);
export const policyRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('late_punch_in'), graceMinutes: z.number().int().min(0).max(240), afterMarks: z.number().int().min(1).max(31), consequence }),
  z.object({ type: z.literal('early_punch_out'), thresholdMinutes: z.number().int().min(0).max(240), afterMarks: z.number().int().min(1).max(31), consequence }),
  z.object({ type: z.literal('min_hours'), halfDayBelowMinutes: z.number().int().min(0).max(1440), absentBelowMinutes: z.number().int().min(0).max(1440) }),
  z.object({ type: z.literal('productivity'), minProductiveMinutes: z.number().int().min(0).max(1440), consequence: z.enum(['half_day', 'flag']) }),
  z.object({ type: z.literal('task_completion'), minTasks: z.number().int().min(0).max(500), consequence: z.enum(['half_day', 'flag']) }),
  z.object({ type: z.literal('missing_punch_out'), treatment: z.enum(['auto_punch_out', 'half_day', 'pending_regularization']) }),
  z.object({ type: z.literal('overtime'), thresholdMinutes: z.number().int().min(0).max(720) }),
]);
export const policyRulesSchema = z.array(policyRuleSchema).max(30);
