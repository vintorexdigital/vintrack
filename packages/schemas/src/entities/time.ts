import { z } from 'zod';
import { defineEntity, f } from '../entity.js';
import { shiftRulesSchema, policyRulesSchema, entitlementSchema, restrictionsSchema } from '../rule-config.js';

const status = f.select('Status', ['active', 'inactive'], { default: 'active', list: true, filter: true, sort: true });

export const breakTypes = defineEntity({
  key: 'break-types', singular: 'Break type', plural: 'Break types', module: 'time', resource: 'break-type',
  path: '/time/break-types', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'timesheets',
  fields: {
    name: f.text('Break name', { required: true, list: true, sort: true, search: true }),
    paid: f.boolean('Paid break', { default: false, list: true, filter: true }),
    allowanceMinutes: f.number('Allowance per shift (minutes)', { min: 1, max: 480, default: 30, list: true }),
    status,
  },
  empty: { title: 'No break types yet', hint: 'Add lunch, tea or meeting breaks so shifts can track break time.' },
});

export const shifts = defineEntity({
  key: 'shifts', singular: 'Working shift', plural: 'Working shifts', module: 'time', resource: 'shift',
  path: '/time/shifts', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'attendance',
  fields: {
    name: f.text('Shift name', { required: true, list: true, sort: true, search: true, section: 'Timing' }),
    timezone: f.text('Timezone', { required: true, default: 'Asia/Kolkata', list: true, section: 'Timing', help: 'IANA name, for example Asia/Kolkata.' }),
    startTime: f.time('Start time', { required: true, list: true, sort: true, section: 'Timing' }),
    maxPunchInTime: f.time('Latest punch-in without being late', { list: true, section: 'Timing', help: 'Punching in after this is a late arrival. Defaults to the start time.' }),
    workingMinutes: f.number('Working time (minutes)', { required: true, min: 30, max: 1440, default: 540, list: true, section: 'Timing' }),
    breakAllowanceMinutes: f.number('Break allowance (minutes)', { min: 0, max: 480, default: 60, section: 'Timing' }),
    continuousIdleMinutes: f.number('Continuous idle threshold (minutes)', { min: 1, max: 240, default: 5, section: 'Timing', help: 'Desktop agent: input-free time beyond this counts as idle.' }),
    rules: f.json('Rules', shiftRulesSchema.default(shiftRulesSchema.parse({})), { editor: 'shift-rules', hideInForm: false, section: 'Rules' }),
    status,
  },
  empty: { title: 'No working shifts yet', hint: 'A shift sets working hours and every punch rule. Create one before adding employees.' },
});

export const attendancePolicies = defineEntity({
  key: 'attendance-policies', singular: 'Attendance policy', plural: 'Attendance policies', module: 'attendance', resource: 'policy',
  path: '/attendance/policies', titleField: 'name', defaultSort: '-startDate', licenseModule: 'attendance',
  fields: {
    name: f.text('Policy name', { required: true, list: true, sort: true, search: true }),
    startDate: f.date('Starts on', { required: true, list: true, sort: true, filter: true }),
    description: f.textarea('Description'),
    shiftIds: f.multiref('Applies to shifts', 'shifts'),
    rules: f.json('Rules', policyRulesSchema.default([]), { editor: 'policy-rules' }),
    state: f.select('State', ['draft', 'published'], { default: 'draft', list: true, filter: true, sort: true, hideInForm: true }),
    revision: f.number('Version', { default: 1, min: 1, list: true, hideInForm: true }),
    previousId: f.ref('Previous version', 'attendance-policies', { hideInForm: true }),
  },
  empty: { title: 'No attendance policies yet', hint: 'Policies turn late arrivals, early exits and short days into half days or deductions.' },
});

export const holidays = defineEntity({
  key: 'holidays', singular: 'Holiday', plural: 'Holidays', module: 'leave', resource: 'holiday',
  path: '/leave/holidays', titleField: 'name', defaultSort: 'startDate', licenseModule: 'leave',
  fields: {
    name: f.text('Holiday name', { required: true, list: true, sort: true, search: true }),
    startDate: f.date('Start date', { required: true, list: true, sort: true, filter: true }),
    endDate: f.date('End date', { required: true, list: true, sort: true, filter: true }),
    optional: f.boolean('Optional holiday', { default: false, list: true, filter: true, help: 'Employees pick a limited number of optional holidays.' }),
    leaveProfileIds: f.multiref('Leave profiles', 'leave-profiles', { help: 'Leave empty to apply to everyone.' }),
  },
  empty: { title: 'No holidays for this year yet', hint: 'Add them or import your state\'s list.' },
});

export const leaveProfiles = defineEntity({
  key: 'leave-profiles', singular: 'Leave profile', plural: 'Leave profiles', module: 'leave', resource: 'profile',
  path: '/leave/profiles', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'leave',
  fields: {
    name: f.text('Profile name', { required: true, list: true, sort: true, search: true }),
    halfDayAllowed: f.boolean('Allow half-day leave', { default: true, list: true }),
    status,
  },
  empty: { title: 'No leave profiles yet', hint: 'A profile groups employees who share leave types, holidays and weekly offs.' },
});

export const nonWorkingRules = defineEntity({
  key: 'non-working-rules', singular: 'Non-working day rule', plural: 'Non-working day rules', module: 'leave', resource: 'non-working-rule',
  path: '/leave/non-working-days', titleField: 'name', defaultSort: 'name', licenseModule: 'leave',
  fields: {
    name: f.text('Rule name', { required: true, list: true, sort: true, search: true }),
    weekday: f.select('Day of the week', [
      { value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' }, { value: '3', label: 'Wednesday' },
      { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' },
    ], { required: true, list: true, filter: true }),
    weeks: f.multiselect('Which weeks', [
      { value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' }, { value: '4', label: '4th' }, { value: '5', label: '5th' },
    ], { help: 'Leave empty for every week, or pick for example the 2nd and 4th Saturday.', list: true }),
    leaveProfileId: f.ref('Leave profile', 'leave-profiles', { list: true, filter: true, help: 'Leave empty to apply to everyone.' }),
  },
  empty: { title: 'No non-working day rules', hint: 'Add weekly offs, for example every Sunday and the 2nd and 4th Saturday.' },
});

export const leaveTypes = defineEntity({
  key: 'leave-types', singular: 'Leave type', plural: 'Leave types', module: 'leave', resource: 'type',
  path: '/leave/types', titleField: 'name', defaultSort: 'name', unique: ['name', 'code'], licenseModule: 'leave',
  fields: {
    name: f.text('Leave type name', { required: true, list: true, sort: true, search: true, section: 'Details' }),
    code: f.text('Code', { required: true, maxLength: 10, list: true, sort: true, section: 'Details' }),
    color: f.color('Color', { default: '#0F5E73', section: 'Details' }),
    paid: f.boolean('Paid leave', { default: true, list: true, filter: true, section: 'Details' }),
    lopDeduction: f.boolean('Counts as loss of pay', { default: false, section: 'Details', help: 'Unpaid days reduce payable days in the payroll export.' }),
    description: f.textarea('Description', { section: 'Details' }),
    leaveProfileIds: f.multiref('Leave profiles', 'leave-profiles', { section: 'Details' }),
    entitlement: f.json('Entitlement', entitlementSchema, { editor: 'entitlement', required: true, section: 'Entitlement' }),
    restrictions: f.json('Restrictions', restrictionsSchema.default(restrictionsSchema.parse({})), { editor: 'restrictions', section: 'Restrictions' }),
    status,
  },
  empty: { title: 'No leave types yet', hint: 'Add casual, sick or earned leave, then set how it accrues.' },
});

export const leaveRequests = defineEntity({
  key: 'leave-requests', singular: 'Leave request', plural: 'Leave requests', module: 'leave', resource: 'request',
  path: '/leave/requests', codePrefix: 'LV', titleField: 'code', defaultSort: '-fromDate', scoped: 'employee', ownerColumn: 'employeeId', licenseModule: 'leave',
  fields: {
    employeeId: f.ref('Employee', 'employees', { required: true, list: true, filter: true, immutable: true }),
    leaveTypeId: f.ref('Leave type', 'leave-types', { required: true, list: true, filter: true, immutable: true }),
    duration: f.select('Duration', ['full', 'first_half', 'second_half'], { default: 'full', immutable: true, list: true }),
    fromDate: f.date('From', { required: true, list: true, sort: true, filter: true, immutable: true }),
    toDate: f.date('To', { required: true, list: true, sort: true, filter: true, immutable: true }),
    days: f.number('Days', { min: 0, max: 366, hideInForm: true, list: true }),
    reason: f.textarea('Reason'),
    status: f.select('Status', ['pending', 'approved', 'rejected', 'cancelled'], { default: 'pending', list: true, filter: true, sort: true, hideInForm: true }),
    actionBy: f.ref('Actioned by', 'employees', { hideInForm: true }),
    actionAt: f.datetime('Actioned on', { hideInForm: true, list: true }),
    actionComment: f.textarea('Action comment', { hideInForm: true }),
  },
  empty: { title: 'No leave requests', hint: 'Requests appear here when employees apply for leave.' },
});

export const regularizations = defineEntity({
  key: 'regularizations', singular: 'Regularization request', plural: 'Regularization requests', module: 'attendance', resource: 'regularization',
  path: '/attendance/regularizations', titleField: 'date', defaultSort: '-date', scoped: 'employee', ownerColumn: 'employeeId', licenseModule: 'attendance',
  fields: {
    employeeId: f.ref('Employee', 'employees', { required: true, list: true, filter: true, immutable: true }),
    date: f.date('Date', { required: true, list: true, sort: true, filter: true, immutable: true }),
    currentCode: f.text('Current status', { hideInForm: true, list: true, maxLength: 4 }),
    requestedCode: f.select('Requested status', ['P', 'HP', 'AB'], { required: true, list: true, filter: true, immutable: true }),
    reason: f.textarea('Reason', { required: true }),
    status: f.select('Status', ['pending', 'approved', 'rejected', 'cancelled'], { default: 'pending', list: true, filter: true, sort: true, hideInForm: true }),
    actionBy: f.ref('Actioned by', 'employees', { hideInForm: true }),
    actionAt: f.datetime('Actioned on', { hideInForm: true, list: true }),
    actionComment: f.textarea('Action comment', { hideInForm: true }),
  },
  empty: { title: 'No regularization requests', hint: 'Requests appear when employees ask to correct a day.' },
});

export const POLICY_STATES = z.enum(['draft', 'published']);
