import { CalendarDays, Fingerprint, ListChecks, MapPinned, ShieldCheck, Store, type LucideIcon } from 'lucide-react';

export interface ModuleInfo {
  slug: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  intro: string;
  points: { title: string; body: string }[];
}

/** Only what the product does today. New modules are added here when they ship, not before. */
export const MODULES: ModuleInfo[] = [
  {
    slug: 'attendance', name: 'Attendance and shifts', icon: Fingerprint, tagline: 'Punch rules enforced on the server, a register payroll can trust.',
    intro: 'Define shifts once, then let every punch be checked against them: allowed devices, office networks, geo-fences, early and late limits, comments and selfies.',
    points: [
      { title: 'Rules the app cannot skip', body: 'Restrictions are checked by the server on every punch, so an old app version or a hand-built request cannot get around them.' },
      { title: 'Night shifts that make sense', body: 'A shift that crosses midnight belongs to the day it starts, and an in-progress day is never marked absent early.' },
      { title: 'Policies that explain themselves', body: 'Late marks, minimum hours, missing punch-outs and overtime are versioned policies. Every deduction links to the rule that caused it, and you can preview a re-run before applying it.' },
      { title: 'Monthly register and payroll export', body: 'One register for the pay cycle with payable days, overtime and an Excel export. Lock a cycle once payroll is done.' },
    ],
  },
  {
    slug: 'leave', name: 'Leave and holidays', icon: CalendarDays, tagline: 'Entitlements, accruals and approvals without a spreadsheet.',
    intro: 'Leave types with tiered entitlements, accrual rules, carry-forward and restrictions, applied to the right people through leave profiles.',
    points: [
      { title: 'Accrual by rule', body: 'Monthly, quarterly, half-yearly or flat, with proration for people who join mid-year. Balances are computed from rules, never typed in.' },
      { title: 'Restrictions that match your policy', body: 'Notice periods, maximum consecutive days, sandwich rules, gender and probation limits, attachments and auto-approval.' },
      { title: 'Approvals where managers already are', body: 'Reportees’ requests land in one queue. Approved future leave reserves balance immediately.' },
      { title: 'Calendar and balances', body: 'See who is away across the team, and every employee’s balance with a ledger behind each number.' },
    ],
  },
  {
    slug: 'field-tracking', name: 'Field tracking', icon: MapPinned, tagline: 'A live map that only knows what it should.',
    intro: 'See where your field team is during working time, review the day’s trail, and keep it private outside working hours.',
    points: [
      { title: 'Working time only', body: 'Locations are recorded only between punch in and punch out. Points outside that window are refused by the server.' },
      { title: 'Transparent to employees', body: 'The app shows when tracking is on and how often it reports. Companies can switch tracking off entirely and set how long history is kept.' },
      { title: 'Trails with stops', body: 'Distance travelled, stops of ten minutes or more and time on the move, from cleaned-up location points.' },
      { title: 'Scoped to the team', body: 'Managers see their reportees. Nobody sees people outside their scope.' },
    ],
  },
  {
    slug: 'tasks-customers', name: 'Customers and tasks', icon: Store, tagline: 'Assign visits, check in on site, close with an outcome.',
    intro: 'Keep customers and contacts, assign tasks to your team, and record where each visit started and finished.',
    points: [
      { title: 'Check-in that checks the place', body: 'Starting a visit compares the employee’s position with the customer’s location. Warn or block when they are too far, per company setting.' },
      { title: 'Customers and contacts', body: 'Account owners, primary contacts and the history of tasks for each customer in one place.' },
      { title: 'Work lists for people on the move', body: 'A simple My tasks list: start, complete, and say how it went.' },
      { title: 'Audit trail', body: 'Every status change records who did it and when.' },
    ],
  },
  {
    slug: 'security', name: 'Roles, privacy and audit', icon: ShieldCheck, tagline: 'Every company in its own walls, every change on the record.',
    intro: 'Multi-tenant isolation is enforced in the database, not just in application code, and access is granted by role and data scope.',
    points: [
      { title: 'Isolation in the database', body: 'Row-level security on every company table means a bug in one query cannot return another company’s rows.' },
      { title: 'Roles and data scopes', body: 'Start from system roles or build your own. Scope reads to self, team, reportees, department, location or everything.' },
      { title: 'Audit log', body: 'Who changed what, with before and after values, searchable by the admin and exportable.' },
      { title: 'Support access on your terms', body: 'Platform support can only look into your company during a time-boxed session you allowed, with a stated reason, and never sees business data.' },
    ],
  },
];

export const moduleBySlug = (slug: string): ModuleInfo | undefined => MODULES.find((m) => m.slug === slug);
export { ListChecks };
