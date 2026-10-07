import type { EntityKit } from './entity.js';

export type DataScope = 'all' | 'department' | 'location' | 'team' | 'reportees' | 'direct' | 'self';

export interface PermissionDef {
  key: string;
  module: string;
  resource: string;
  action: string;
  description: string;
  /** True when a data scope narrows the grant (reads of employee-owned data). */
  scopeable: boolean;
}

const CRUD_ACTIONS = ['read', 'create', 'update', 'delete', 'restore', 'export', 'import'] as const;

/** Permissions that are not plain CRUD on an entity. Each module appends its own. */
export const CUSTOM_PERMISSIONS: Omit<PermissionDef, 'module' | 'resource' | 'action'>[] = [
  { key: 'company.settings.read', description: 'View company settings', scopeable: false },
  { key: 'company.settings.update', description: 'Change company settings', scopeable: false },
  { key: 'company.audit.read', description: 'View the company audit log', scopeable: false },
  { key: 'company.roles.manage', description: 'Create and edit roles', scopeable: false },
  { key: 'company.users.invite', description: 'Invite and remove users', scopeable: false },
  { key: 'company.users.read', description: 'View users and memberships', scopeable: false },
  { key: 'company.support.manage', description: 'Allow or end platform support sessions', scopeable: false },
  { key: 'company.export', description: 'Export all company data', scopeable: false },
  { key: 'calls.session.read', description: 'View calls placed through Trackrex', scopeable: true },
  { key: 'calls.recording.read', description: 'Listen to call recordings', scopeable: true },
  { key: 'automation.run.read', description: 'View workflow runs and their logs', scopeable: false },
  { key: 'company.messages.read', description: 'View the log of messages sent to people (email, SMS, WhatsApp, push)', scopeable: false },
  { key: 'company.encryption.manage', description: 'View encryption status and rotate the company data key', scopeable: false },
  { key: 'billing.subscription.read', description: 'View plan, seats and invoices', scopeable: false },
  { key: 'billing.subscription.manage', description: 'Change plan and seats, manage payment methods', scopeable: false },
  { key: 'hr.employee.invite', description: 'Invite employees', scopeable: true },
  { key: 'hr.employee.exit', description: 'Exit employees', scopeable: true },
  { key: 'hr.employee.transfer', description: 'Transfer employees to a new manager', scopeable: true },
  { key: 'hr.employee.reset_device', description: 'Reset device binding', scopeable: true },
  { key: 'attendance.punch.create', description: 'Punch in and out for yourself', scopeable: false },
  { key: 'attendance.punch.read', description: 'View punches', scopeable: true },
  { key: 'attendance.punch.override', description: 'Punch on behalf of an employee', scopeable: true },
  { key: 'attendance.day.read', description: 'View attendance days', scopeable: true },
  { key: 'attendance.day.override', description: 'Override an attendance day', scopeable: true },
  { key: 'attendance.register.read', description: 'View the monthly register', scopeable: true },
  { key: 'attendance.register.export', description: 'Export the payroll register', scopeable: true },
  { key: 'attendance.regularization.create', description: 'Request regularization', scopeable: false },
  { key: 'attendance.regularization.read', description: 'View regularization requests', scopeable: true },
  { key: 'attendance.regularization.approve', description: 'Approve or reject regularization', scopeable: true },
  { key: 'attendance.policy.publish', description: 'Publish attendance policies', scopeable: false },
  { key: 'attendance.policy.rerun', description: 'Re-run attendance policies', scopeable: false },
  { key: 'leave.request.create', description: 'Apply for leave', scopeable: false },
  { key: 'leave.request.read', description: 'View leave requests', scopeable: true },
  { key: 'leave.request.approve', description: 'Approve or reject leave', scopeable: true },
  { key: 'leave.request.cancel', description: 'Cancel leave requests', scopeable: true },
  { key: 'leave.balance.read', description: 'View leave balances', scopeable: true },
  { key: 'leave.balance.adjust', description: 'Adjust leave balances', scopeable: true },
  { key: 'productivity.data.read', description: 'View productivity data', scopeable: true },
  { key: 'location.live.read', description: 'View live locations', scopeable: true },
  { key: 'location.trail.read', description: 'View location history and trails', scopeable: true },
  { key: 'location.ping.create', description: 'Send your location while working', scopeable: false },
  { key: 'expenses.claim.approve', description: 'Approve or reject expense claims', scopeable: true },
  { key: 'expenses.claim.pay', description: 'Mark expense claims as paid', scopeable: false },
  { key: 'productivity.activity.create', description: 'Send your desktop activity while working', scopeable: false },
  { key: 'field.task.work', description: 'Start, check in to and complete tasks assigned to you', scopeable: true },
  { key: 'reports.catalog.read', description: 'Run and view reports', scopeable: true },
  { key: 'feed.event.read', description: 'View the activity feed', scopeable: true },
];

export interface PermissionRegistry {
  all: PermissionDef[];
  byKey: Map<string, PermissionDef>;
}

export function buildPermissionRegistry(kits: EntityKit[]): PermissionRegistry {
  const all: PermissionDef[] = [];
  for (const kit of kits) {
    for (const action of CRUD_ACTIONS) {
      const key = `${kit.def.module}.${kit.def.resource}.${action}`;
      all.push({
        key, module: kit.def.module, resource: kit.def.resource, action,
        description: `${action[0]!.toUpperCase()}${action.slice(1)} ${kit.def.plural.toLowerCase()}`,
        scopeable: kit.def.scoped === 'employee' && ['read', 'update', 'delete', 'export'].includes(action),
      });
    }
  }
  for (const c of CUSTOM_PERMISSIONS) {
    const [module, resource, action] = c.key.split('.') as [string, string, string];
    if (!all.some((p) => p.key === c.key)) all.push({ ...c, module, resource, action });
  }
  return { all, byKey: new Map(all.map((p) => [p.key, p])) };
}

export interface Grant {
  permission: string;
  scope: DataScope;
}

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  /** Returns the scope this role gets for a permission, or null to withhold it. */
  grant: (p: PermissionDef) => DataScope | null;
}

const isReadLike = (p: PermissionDef) => p.action === 'read';
const orgReference = (p: PermissionDef) => p.module === 'org' && isReadLike(p);
const isApproval = (p: PermissionDef) => p.action === 'approve' || p.action === 'cancel';
const TEAM_MODULES = new Set(['sales', 'attendance', 'leave', 'productivity', 'location', 'feed', 'reports', 'field', 'expenses', 'calls', 'timesheet', 'hr']);

export const SYSTEM_ROLES: SystemRole[] = [
  { key: 'owner', name: 'Owner', description: 'Controls billing, ownership and company deletion.', grant: () => 'all' },
  {
    key: 'admin', name: 'Admin', description: 'Full access except ownership and company deletion.',
    grant: (p) => (p.key === 'company.delete' ? null : 'all'),
  },
  {
    key: 'hr_admin', name: 'HR admin', description: 'People, attendance, leave and policies.',
    grant: (p) => (['org', 'hr', 'attendance', 'leave', 'timesheet', 'reports', 'feed', 'expenses'].includes(p.module) || p.key === 'company.users.read' ? 'all' : null),
  },
  {
    key: 'billing_admin', name: 'Billing admin', description: 'Plan, seats, invoices and payment methods.',
    grant: (p) => (p.module === 'billing' ? 'all' : orgReference(p) ? 'all' : null),
  },
  {
    key: 'manager', name: 'Manager', description: 'Sees and approves for their reportees.',
    grant: (p) => {
      if (orgReference(p)) return 'all';
      if (p.action === 'create' && p.module !== 'org' && p.module !== 'hr' && p.key.startsWith('attendance.punch')) return 'all';
      if (p.key === 'attendance.punch.create' || p.key === 'leave.request.create' || p.key === 'attendance.regularization.create') return 'all';
      if (p.key === 'location.ping.create' || p.key === 'productivity.activity.create') return 'all';
      if (['expenses.claim.create', 'expenses.claim.update', 'calls.call.create', 'reports.builder.create', 'reports.builder.update', 'reports.builder.delete', 'reports.dashboard.create', 'reports.dashboard.update', 'reports.dashboard.delete'].includes(p.key)) return 'self';
      if (p.key === 'sales.lead.create' || p.key === 'sales.lead.update') return 'reportees';
      if (p.module === 'field' && ['task', 'customer', 'contact'].includes(p.resource) && ['create', 'update'].includes(p.action)) return 'reportees';
      if (p.key === 'field.task.work') return 'reportees';
      if (p.key === 'location.live.read' || p.key === 'location.trail.read') return 'reportees';
      if (TEAM_MODULES.has(p.module) && (isReadLike(p) || isApproval(p) || p.action === 'export')) return 'reportees';
      return null;
    },
  },
  {
    key: 'functional_manager', name: 'Functional manager', description: 'Sees their team across reporting lines.',
    grant: (p) => {
      if (orgReference(p)) return 'all';
      if (p.key === 'attendance.punch.create' || p.key === 'leave.request.create' || p.key === 'attendance.regularization.create') return 'all';
      if (TEAM_MODULES.has(p.module) && (isReadLike(p) || p.action === 'export')) return 'team';
      return null;
    },
  },
  {
    key: 'employee', name: 'Employee', description: 'Own attendance, leave, tasks and expenses.',
    grant: (p) => {
      if (orgReference(p)) return 'all';
      if (['attendance.punch.create', 'leave.request.create', 'attendance.regularization.create', 'leave.request.cancel', 'location.ping.create', 'field.task.work', 'expenses.claim.create', 'expenses.claim.update', 'productivity.activity.create', 'sales.lead.create', 'sales.lead.update', 'calls.call.create'].includes(p.key)) return 'self';
      if (p.module === 'field' && ['customer', 'contact'].includes(p.resource) && isReadLike(p)) return 'all';
      if (p.key === 'expenses.category.read') return 'all';
      if (TEAM_MODULES.has(p.module) && isReadLike(p) && !['hr', 'reports', 'location', 'feed'].includes(p.module)) return 'self';
      if (p.key === 'hr.employee.read') return 'self';
      return null;
    },
  },
  {
    key: 'external', name: 'External user', description: 'Read-only access for auditors and accountants.',
    grant: (p) => (p.key === 'reports.catalog.read' || p.key === 'billing.subscription.read' ? 'all' : orgReference(p) ? 'all' : null),
  },
];

export function grantsFor(role: SystemRole, registry: PermissionRegistry): Grant[] {
  const out: Grant[] = [];
  for (const p of registry.all) {
    const scope = role.grant(p);
    if (scope) out.push({ permission: p.key, scope });
  }
  return out;
}
