import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const ALL_MODULES = [
  'core', 'attendance', 'leave', 'tracking', 'tasks', 'customers', 'expenses', 'call_log', 'desktop_activity', 'timesheets',
  'leads', 'targets', 'whatsapp', 'payroll', 'onboarding', 'help_desk', 'assets', 'advanced_analytics', 'api', 'white_label',
] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

export interface PlanInfo {
  key: string;
  name: string;
  tagline: string;
  modules: readonly ModuleKey[];
  highlights: string[];
  /** Plans a company can choose and be billed for. Trial is a state, not something to buy. */
  purchasable: boolean;
}

/** What each plan includes. Prices live in the database (platform.plans) so finance can change them without a release. */
export const PLAN_CATALOG: PlanInfo[] = [
  { key: 'trial', name: 'Trial', tagline: 'Everything, free for a short while', modules: ALL_MODULES, highlights: ['All modules', 'Up to the seats you are given', 'No card needed'], purchasable: false },
  {
    key: 'office', name: 'Office', tagline: 'Attendance, leave and desktop productivity',
    modules: ['core', 'attendance', 'leave', 'desktop_activity', 'timesheets'],
    highlights: ['Attendance, shifts and policies', 'Leave and holidays', 'Desktop activity and timesheets'], purchasable: true,
  },
  {
    key: 'field', name: 'Field', tagline: 'Attendance, tracking, customers and tasks',
    modules: ['core', 'attendance', 'leave', 'tracking', 'tasks', 'customers', 'expenses', 'call_log'],
    highlights: ['Everything in attendance and leave', 'Live map and trails', 'Customers, tasks and visits', 'Expenses and call log'], purchasable: true,
  },
  { key: 'all_in_one', name: 'All in one', tagline: 'Every module for every kind of team', modules: ALL_MODULES, highlights: ['Every Field and Office feature', 'Advanced analytics and API', 'Priority support'], purchasable: true },
];
export const planByKey = (key: string): PlanInfo | undefined => PLAN_CATALOG.find((p) => p.key === key);

export const subscribeBody = z.object({
  planKey: z.enum(['office', 'field', 'all_in_one']),
  seats: z.number().int().min(1).max(100000),
});

export const changeSubscriptionBody = z.object({
  planKey: z.enum(['office', 'field', 'all_in_one']).optional(),
  seats: z.number().int().min(1).max(100000).optional(),
}).refine((v) => v.planKey !== undefined || v.seats !== undefined, { message: 'Choose a plan or a seat count.' });

export const updatePlanBody = z.object({
  prices: z.record(z.string().length(3), z.number().int().min(0).max(100_000_000)),
  active: z.boolean().optional(),
});

export const generateInvoiceBody = z.object({ date: isoDate.optional() });

export const recordPaymentBody = z.object({
  amountMinor: z.number().int().min(1),
  method: z.enum(['bank_transfer', 'cheque', 'cash', 'other']).default('bank_transfer'),
  reference: z.string().trim().max(120).optional(),
});

export const voidInvoiceBody = z.object({ reason: z.string().trim().min(3).max(300) });
export const invoiceIdParam = z.object({ id: uuid });
