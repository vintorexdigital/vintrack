import {
  Building2, CalendarDays, CalendarRange, CircleUserRound, ClipboardList, Clock, Fingerprint, Home, KeyRound, Layers, ListChecks,
  MapPinned, Network, Radio, ScrollText, Settings2, ShieldCheck, Table2, UserCog, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '../i18n/messages';

export interface NavItem {
  id: string;
  label: string;
  labelKey?: MessageKey;
  icon: LucideIcon;
  href?: string;
  /** Any one of these grants visibility. */
  perms?: string[];
  /** Licensed module that must be on. */
  module?: string;
  children?: NavItem[];
}

export type Mode = 'manager' | 'employee';

export const MANAGER_NAV: NavItem[] = [
  { id: 'home', label: 'Home', labelKey: 'nav.home', icon: Home, href: '/' },
  { id: 'feed', label: 'Activity feed', labelKey: 'nav.feed', icon: Radio, href: '/feed', perms: ['feed.event.read'] },
  {
    id: 'people', label: 'People', labelKey: 'nav.people', icon: Users, perms: ['hr.employee.read'],
    children: [
      { id: 'employees', label: 'Employees', labelKey: 'nav.employees', icon: Users, href: '/people/employees', perms: ['hr.employee.read'] },
      { id: 'teams', label: 'Teams', labelKey: 'nav.teams', icon: UsersRound, href: '/org/teams', perms: ['org.team.read'] },
      { id: 'orgchart', label: 'Org chart', labelKey: 'nav.orgchart', icon: Network, href: '/people/org-chart', perms: ['hr.employee.read'] },
    ],
  },
  {
    id: 'attendance', label: 'Attendance', labelKey: 'nav.attendance', icon: Fingerprint, module: 'attendance', perms: ['attendance.punch.read', 'attendance.register.read'],
    children: [
      { id: 'log', label: 'Daily log', labelKey: 'nav.dailylog', icon: ListChecks, href: '/attendance/log', perms: ['attendance.punch.read'] },
      { id: 'register', label: 'Monthly register', labelKey: 'nav.register', icon: Table2, href: '/attendance/register', perms: ['attendance.register.read'] },
      { id: 'regularizations', label: 'Regularizations', labelKey: 'nav.regularizations', icon: ClipboardList, href: '/attendance/regularizations', perms: ['attendance.regularization.read'] },
    ],
  },
  {
    id: 'leave', label: 'Leave', labelKey: 'nav.leave', icon: CalendarDays, module: 'leave', perms: ['leave.request.read'],
    children: [
      { id: 'requests', label: 'Requests', labelKey: 'nav.requests', icon: ClipboardList, href: '/leave/requests', perms: ['leave.request.read'] },
      { id: 'calendar', label: 'Calendar', labelKey: 'nav.calendar', icon: CalendarRange, href: '/leave/calendar', perms: ['leave.request.read'] },
      { id: 'balances', label: 'Balances', labelKey: 'nav.balances', icon: Wallet, href: '/leave/balances', perms: ['leave.balance.read'] },
    ],
  },
  {
    id: 'field', label: 'Field', labelKey: 'nav.field', icon: MapPinned, module: 'tracking', perms: ['field.geo-fence.read'],
    children: [{ id: 'geofences', label: 'Geo-fences', labelKey: 'nav.geofences', icon: MapPinned, href: '/field/geo-fences', perms: ['field.geo-fence.read'] }],
  },
  { id: 'admin', label: 'Admin', labelKey: 'nav.admin', icon: Settings2, href: '/admin', perms: ['company.settings.read', 'org.department.create', 'time.shift.create', 'company.roles.manage'] },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { id: 'home', label: 'Home', labelKey: 'nav.home', icon: Home, href: '/' },
  { id: 'my-attendance', label: 'My attendance', labelKey: 'nav.myattendance', icon: Fingerprint, href: '/me/attendance', module: 'attendance' },
  { id: 'my-leave', label: 'My leave', labelKey: 'nav.myleave', icon: CalendarDays, href: '/me/leave', module: 'leave' },
  { id: 'profile', label: 'Profile', labelKey: 'nav.profile', icon: CircleUserRound, href: '/me/profile' },
];

export interface AdminGroup { id: string; label: string; icon: LucideIcon; items: { label: string; href: string; perms?: string[]; module?: string }[] }

/** The admin area's secondary sidebar, grouped by intent. */
export const ADMIN_NAV: AdminGroup[] = [
  {
    id: 'organization', label: 'Organization', icon: Building2,
    items: [
      { label: 'Work locations', href: '/admin/organization/work-locations', perms: ['org.work-location.read'] },
      { label: 'Departments', href: '/admin/organization/departments', perms: ['org.department.read'] },
      { label: 'Designations', href: '/admin/organization/designations', perms: ['org.designation.read'] },
      { label: 'Employee types', href: '/admin/organization/employee-types', perms: ['org.employee-type.read'] },
      { label: 'Employment types', href: '/admin/organization/employment-types', perms: ['org.employment-type.read'] },
      { label: 'Business units', href: '/admin/organization/business-units', perms: ['org.business-unit.read'] },
      { label: 'Cost centers', href: '/admin/organization/cost-centers', perms: ['org.cost-center.read'] },
    ],
  },
  {
    id: 'time', label: 'Time and attendance', icon: Clock, 
    items: [
      { label: 'Working shifts', href: '/admin/time/shifts', perms: ['time.shift.read'], module: 'attendance' },
      { label: 'Attendance policies', href: '/admin/time/policies', perms: ['attendance.policy.read'], module: 'attendance' },
      { label: 'Break types', href: '/admin/time/break-types', perms: ['time.break-type.read'], module: 'timesheets' },
      { label: 'Geo-fences', href: '/field/geo-fences', perms: ['field.geo-fence.read'], module: 'tracking' },
      { label: 'Attendance settings', href: '/admin/settings?section=Attendance', perms: ['company.settings.read'], module: 'attendance' },
    ],
  },
  {
    id: 'leave', label: 'Leave', icon: CalendarDays,
    items: [
      { label: 'Leave profiles', href: '/admin/leave/profiles', perms: ['leave.profile.read'], module: 'leave' },
      { label: 'Leave types', href: '/admin/leave/types', perms: ['leave.type.read'], module: 'leave' },
      { label: 'Holidays', href: '/admin/leave/holidays', perms: ['leave.holiday.read'], module: 'leave' },
      { label: 'Non-working days', href: '/admin/leave/non-working-days', perms: ['leave.non-working-rule.read'], module: 'leave' },
      { label: 'Leave settings', href: '/admin/settings?section=Leave', perms: ['company.settings.read'], module: 'leave' },
    ],
  },
  {
    id: 'security', label: 'Security', icon: ShieldCheck,
    items: [
      { label: 'Users and invitations', href: '/admin/security/users', perms: ['company.users.read'] },
      { label: 'Roles and permissions', href: '/admin/security/roles', perms: ['company.roles.manage'] },
      { label: 'Sign-in methods', href: '/admin/settings?section=Sign-in and security', perms: ['company.settings.read'] },
      { label: 'Support access', href: '/admin/security/support', perms: ['company.support.manage'] },
      { label: 'Audit log', href: '/admin/security/audit', perms: ['company.audit.read'] },
    ],
  },
  {
    id: 'settings', label: 'Company settings', icon: Layers,
    items: [
      { label: 'All settings', href: '/admin/settings', perms: ['company.settings.read'] },
      { label: 'Company profile', href: '/admin/company', perms: ['company.settings.read'] },
    ],
  },
];

export { UserCog, KeyRound, ScrollText };
