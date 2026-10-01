export interface Company { id: string; slug: string; name: string }
export interface Me {
  user: { id: string; name: string; email: string | null } | null;
  company: Company & { timezone: string; currency: string };
  membership: { id: string; employeeId: string | null; roleKeys: string[] };
  permissions: { permission: string; scope: string }[];
  modules: string[];
}
export interface PunchStatus {
  linked: boolean;
  state?: 'in' | 'out' | 'break';
  since?: string | null;
  shift?: { name: string; startTime: string; timezone: string; workingMinutes: number } | null;
  requirements?: { sourceAllowed: boolean; selfie: string; location: string; commentOnIn: boolean; commentOnOut: boolean } | null;
  today?: { workedMinutes: number; breakMinutes: number; lateMinutes: number; statusCode: string } | null;
}
export interface Task { id: string; code: string; title: string; taskType: string; customerId: string | null; dueAt: string | null; priority: string; status: string; description: string | null }
export interface LeaveBalance { code: string; name: string; balance: number; taken: number; accrued: number; pending: number }
export type SignInResponse =
  | { status: 'ok'; accessToken: string; refreshToken: string; company: Company }
  | { status: 'choose_company'; selectionToken: string; companies: Company[] };
