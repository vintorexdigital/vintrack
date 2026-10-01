/** Shown only when the live prices cannot be fetched. The source of truth is the platform.plans table, served by /v1/public/plans. */
export interface PublicPlan { key: string; name: string; tagline: string; highlights: string[]; prices: Record<string, number> }

export const FALLBACK_PLANS: PublicPlan[] = [
  { key: 'office', name: 'Office', tagline: 'Attendance and leave for office teams', highlights: ['Attendance, shifts and policies', 'Leave and holidays', 'Roles, audit and support access'], prices: { INR: 9900, USD: 200 } },
  { key: 'field', name: 'Field', tagline: 'Attendance, tracking, customers and tasks', highlights: ['Everything in attendance and leave', 'Live map and trails', 'Customers, tasks and visits'], prices: { INR: 14900, USD: 300 } },
  { key: 'all_in_one', name: 'All in one', tagline: 'Every module for every kind of team', highlights: ['Every Field and Office feature', 'New modules as they ship', 'Priority support'], prices: { INR: 19900, USD: 400 } },
];
