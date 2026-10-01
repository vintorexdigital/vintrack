'use client';
import { Avatar, StatusPill } from '@trackrex/ui';
import { Check, X } from 'lucide-react';
import {
  appClassifications, attendancePolicies, breakTypes, businessUnits, contacts, costCenters, customers, departments, designations, employeeTypes, expenseCategories, expenseClaims, employmentTypes, employees, geoFences,
  holidays, leaveProfiles, leaveRequests, leaveTypes, nonWorkingRules, regularizations, shifts, tasks, teams, workLocations,
} from '@trackrex/schemas';
import { defineResource, type Resource, type Row } from '@/shared/crud/resource';
import { PolicyRulesEditor } from './editors/policy-rules';
import { EntitlementEditor, RestrictionsEditor } from './editors/leave-config';
import { ShiftRulesEditor } from './editors/shift-rules';
import { ApprovalActions, EmployeeActions, ExpenseActions, PolicyActions, TaskActions } from './row-actions';
import { CustomerTabs } from './field/customer-tabs';
import { TeamMembersTab } from './teams/members-tab';
import { ShiftEmployeesTab } from './shifts/employees-tab';

const A = 'Admin';
const statusTone = (s: unknown) => (s === 'active' || s === 'approved' || s === 'published' || s === 'paid' ? 'present' : s === 'pending' || s === 'draft' || s === 'invited' ? 'pending' : s === 'rejected' || s === 'cancelled' || s === 'suspended' ? 'absent' : 'non-working');
const taskTone = (s: unknown) => (s === 'completed' ? 'present' : s === 'in_progress' ? 'pending' : s === 'cancelled' ? 'absent' : 'non-working') as 'present' | 'pending' | 'absent' | 'non-working';
const priorityTone = (s: unknown) => (s === 'urgent' ? 'absent' : s === 'high' ? 'late' : 'non-working') as 'absent' | 'late' | 'non-working';
const pill = (key = 'status') => (row: Row) => <StatusPill tone={statusTone(row[key])}>{String(row[key] ?? '').replace(/_/g, ' ')}</StatusPill>;

export const resources = {
  workLocations: defineResource(workLocations, '/admin/organization/work-locations', { scope: A, cells: { status: pill() } }),
  departments: defineResource(departments, '/admin/organization/departments', { scope: A, cells: { status: pill() } }),
  designations: defineResource(designations, '/admin/organization/designations', { scope: A, cells: { status: pill() } }),
  employeeTypes: defineResource(employeeTypes, '/admin/organization/employee-types', { scope: A, cells: { status: pill() } }),
  employmentTypes: defineResource(employmentTypes, '/admin/organization/employment-types', { scope: A, cells: { status: pill() } }),
  businessUnits: defineResource(businessUnits, '/admin/organization/business-units', { scope: A, cells: { status: pill() } }),
  costCenters: defineResource(costCenters, '/admin/organization/cost-centers', { scope: A, cells: { status: pill() } }),
  teams: defineResource(teams, '/org/teams', { cells: { status: pill() }, detailTabs: (row) => [{ value: 'members', label: 'Members', content: <TeamMembersTab teamId={row.id} /> }] }),
  employees: defineResource(employees, '/people/employees', {
    cells: {
      displayName: (row) => <span className="flex items-center gap-2"><Avatar name={String(row.displayName)} size={24} /><span className="font-medium">{String(row.displayName)}</span></span>,
      status: pill(),
    },
    rowActions: (row, ctx) => EmployeeActions(row, ctx),
    hiddenFields: ['homeLatitude', 'homeLongitude'],
  }),
  shifts: defineResource(shifts, '/admin/time/shifts', {
    scope: A, cells: { status: pill() }, editors: { 'shift-rules': ShiftRulesEditor },
    detailTabs: (row) => [{ value: 'employees', label: 'Employees', content: <ShiftEmployeesTab shiftId={row.id} /> }],
  }),
  policies: defineResource(attendancePolicies, '/admin/time/policies', {
    scope: A, editors: { 'policy-rules': PolicyRulesEditor }, rowActions: (row, ctx) => PolicyActions(row, ctx),
    cells: { state: (row) => <StatusPill tone={statusTone(row.state)}>{String(row.state)}</StatusPill>, revision: (row) => <span className="tabular-nums">v{String(row.revision)}</span> },
    hiddenFields: ['shiftIds'],
  }),
  breakTypes: defineResource(breakTypes, '/admin/time/break-types', { scope: A, cells: { status: pill(), paid: (row) => (row.paid ? 'Paid' : 'Unpaid') } }),
  geoFences: defineResource(geoFences, '/field/geo-fences', { cells: { status: pill() } }),
  customers: defineResource(customers, '/field/customers', { cells: { status: pill() }, detailTabs: (row) => CustomerTabs(row.id) }),
  contacts: defineResource(contacts, '/field/contacts', { cells: { isPrimary: (row) => (row.isPrimary ? 'Primary' : '') } }),
  tasks: defineResource(tasks, '/field/tasks', {
    createLabel: 'Assign task', rowActions: (row, ctx) => TaskActions(row, ctx),
    cells: {
      status: (row) => <StatusPill tone={taskTone(row.status)}>{String(row.status).replace(/_/g, ' ')}</StatusPill>,
      priority: (row) => <StatusPill tone={priorityTone(row.priority)}>{String(row.priority)}</StatusPill>,
    },
  }),
  expenseClaims: defineResource(expenseClaims, '/expenses/claims', {
    createLabel: 'New claim', rowActions: (row, ctx) => ExpenseActions(row, ctx),
    cells: { status: pill(), amount: (row) => <span className="tabular-nums">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: String(row.currency ?? 'INR') }).format(Number(row.amount))}</span> },
  }),
  expenseCategories: defineResource(expenseCategories, '/admin/expenses/categories', { scope: A, cells: { status: pill(), noteRequired: (row) => (row.noteRequired ? 'Yes' : 'No') } }),
  appClasses: defineResource(appClassifications, '/admin/productivity/app-classes', {
    scope: A, cells: { appClass: (row) => <StatusPill tone={row.appClass === 'productive' ? 'present' : row.appClass === 'unproductive' ? 'absent' : 'non-working'}>{String(row.appClass)}</StatusPill> },
  }),
  leaveProfiles: defineResource(leaveProfiles, '/admin/leave/profiles', { scope: A, cells: { status: pill() } }),
  leaveTypes: defineResource(leaveTypes, '/admin/leave/types', {
    scope: A, cells: { status: pill(), paid: (row) => (row.paid ? <Check className="size-4 text-present" aria-label="Paid" /> : <X className="size-4 text-muted" aria-label="Unpaid" />) },
    editors: { entitlement: EntitlementEditor, restrictions: RestrictionsEditor },
  }),
  holidays: defineResource(holidays, '/admin/leave/holidays', { scope: A, cells: { optional: (row) => (row.optional ? 'Optional' : 'Fixed') } }),
  nonWorkingRules: defineResource(nonWorkingRules, '/admin/leave/non-working-days', {
    scope: A, cells: { weekday: (row) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(row.weekday)] ?? String(row.weekday), weeks: (row) => ((row.weeks as string[] | null)?.length ? (row.weeks as string[]).join(', ') : 'Every week') },
  }),
  leaveRequests: defineResource(leaveRequests, '/leave/requests', {
    cells: { status: pill() }, rowActions: (row, ctx) => ApprovalActions('leave', row, ctx), createLabel: 'Apply for leave', readOnly: true,
  }),
  regularizations: defineResource(regularizations, '/attendance/regularizations', {
    cells: { status: pill() }, rowActions: (row, ctx) => ApprovalActions('regularization', row, ctx), createLabel: 'Request regularization', readOnly: true,
  }),
} satisfies Record<string, Resource>;
