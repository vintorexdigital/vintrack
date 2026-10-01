import { defineEntity, f } from '../entity.js';

export const EMPLOYEE_STATUSES = ['invited', 'active', 'suspended', 'exited'] as const;

export const employees = defineEntity({
  key: 'employees', singular: 'Employee', plural: 'Employees', module: 'hr', resource: 'employee',
  path: '/people/employees', codePrefix: 'EMP', titleField: 'displayName', defaultSort: 'displayName',
  scoped: 'employee', ownerColumn: 'id', unique: ['mobile', 'workEmail'],
  fields: {
    firstName: f.text('First name', { required: true, search: true, section: 'Personal' }),
    lastName: f.text('Last name', { search: true, section: 'Personal' }),
    displayName: f.text('Display name', { required: true, list: true, sort: true, search: true, filter: true, section: 'Personal' }),
    gender: f.select('Gender', ['female', 'male', 'other', 'undisclosed'], { section: 'Personal' }),
    dateOfBirth: f.date('Date of birth', { section: 'Personal' }),
    workEmail: f.email('Work email', { list: true, search: true, filter: true, section: 'Contact' }),
    personalEmail: f.email('Personal email', { section: 'Contact' }),
    mobile: f.phone('Mobile', { list: true, search: true, filter: true, section: 'Contact' }),
    dateOfJoining: f.date('Date of joining', { required: true, sort: true, filter: true, list: true, section: 'Employment' }),
    dateOfExit: f.date('Date of exit', { filter: true, section: 'Employment' }),
    status: f.select('Status', EMPLOYEE_STATUSES, { default: 'active', list: true, filter: true, sort: true, section: 'Employment' }),
    reportingManagerId: f.ref('Reporting manager', 'employees', { list: true, filter: true, section: 'Organization' }),
    functionalManagerId: f.ref('Functional manager', 'employees', { section: 'Organization' }),
    departmentId: f.ref('Department', 'departments', { list: true, filter: true, section: 'Organization' }),
    designationId: f.ref('Designation', 'designations', { list: true, filter: true, section: 'Organization' }),
    workLocationId: f.ref('Work location', 'work-locations', { filter: true, section: 'Organization' }),
    businessUnitId: f.ref('Business unit', 'business-units', { section: 'Organization' }),
    costCenterId: f.ref('Cost center', 'cost-centers', { section: 'Organization' }),
    employeeTypeId: f.ref('Employee type', 'employee-types', { filter: true, section: 'Organization' }),
    employmentTypeId: f.ref('Employment type', 'employment-types', { section: 'Organization' }),
    shiftId: f.ref('Working shift', 'shifts', { list: true, filter: true, section: 'Time and leave', help: 'Takes effect from the date of joining. Use the shift history to schedule a change.' }),
    leaveProfileId: f.ref('Leave profile', 'leave-profiles', { filter: true, section: 'Time and leave' }),
    licenseBundleId: f.ref('License bundle', 'license-bundles', { filter: true, section: 'Time and leave', help: 'Each active employee uses one seat of this bundle.' }),
    homeLatitude: f.number('Home latitude', { min: -90, max: 90, hideInForm: true }),
    homeLongitude: f.number('Home longitude', { min: -180, max: 180, hideInForm: true }),
  },
  empty: { title: 'No employees yet', hint: 'Invite your team or import them from a spreadsheet to get started.' },
});
