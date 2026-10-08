import { defineEntity, f } from '../entity.js';

const status = f.select('Status', ['active', 'inactive'], { default: 'active', list: true, filter: true, sort: true });

const lookup = (key: string, singular: string, plural: string, path: string, resource: string, hint: string) =>
  defineEntity({
    key, singular, plural, module: 'org', resource, path, titleField: 'name', defaultSort: 'name', unique: ['name'],
    fields: {
      name: f.text(`${singular} name`, { required: true, list: true, sort: true, search: true, filter: true }),
      status,
    },
    empty: { title: `No ${plural.toLowerCase()} yet`, hint },
  });

export const departments = defineEntity({
  key: 'departments', singular: 'Department', plural: 'Departments', module: 'org', resource: 'department',
  path: '/org/departments', titleField: 'name', defaultSort: 'name', unique: ['name'],
  fields: {
    name: f.text('Department name', { required: true, list: true, sort: true, search: true, filter: true }),
    parentId: f.ref('Parent department', 'departments', { filter: true, list: true }),
    headId: f.ref('Head of department', 'employees', { filter: true, list: true }),
    status,
  },
  empty: { title: 'No departments yet', hint: 'Add departments so employees, leave profiles and reports can be grouped.' },
});

export const designations = defineEntity({
  key: 'designations', singular: 'Designation', plural: 'Designations', module: 'org', resource: 'designation',
  path: '/org/designations', titleField: 'name', defaultSort: 'name', unique: ['name'],
  fields: {
    name: f.text('Designation name', { required: true, list: true, sort: true, search: true, filter: true }),
    departmentId: f.ref('Department', 'departments', { list: true, filter: true }),
    status,
  },
  empty: { title: 'No designations yet', hint: 'Add designations such as Field executive or Area manager.' },
});

export const teams = defineEntity({
  key: 'teams', singular: 'Team', plural: 'Teams', module: 'org', resource: 'team',
  path: '/org/teams', titleField: 'name', defaultSort: 'name', unique: ['name'],
  fields: {
    name: f.text('Team name', { required: true, list: true, sort: true, search: true, filter: true }),
    leadId: f.ref('Team lead', 'employees', { list: true, filter: true }),
    status,
  },
  empty: { title: 'No teams yet', hint: 'Teams scope what managers see and who receives notifications.' },
});

export const workLocations = defineEntity({
  key: 'work-locations', singular: 'Work location', plural: 'Work locations', module: 'org', resource: 'work-location',
  path: '/org/work-locations', titleField: 'name', defaultSort: 'name', unique: ['name'],
  fields: {
    name: f.text('Location name', { required: true, list: true, sort: true, search: true, filter: true }),
    address: f.textarea('Address', { list: true, search: true }),
    latitude: f.number('Latitude', { min: -90, max: 90 }),
    longitude: f.number('Longitude', { min: -180, max: 180 }),
    radiusMeters: f.number('Radius (metres)', { min: 10, max: 50000, default: 200, help: 'Used for geo-fence checks at this location.' }),
    timezone: f.text('Timezone', { default: 'Asia/Kolkata', list: true, help: 'IANA name, for example Asia/Kolkata.' }),
    status,
  },
  empty: { title: 'No work locations yet', hint: 'Add your offices and branches. Punch checks and the live map use them.' },
});

export const businessUnits = lookup('business-units', 'Business unit', 'Business units', '/org/business-units', 'business-unit', 'Group employees by business unit for reports.');
export const costCenters = lookup('cost-centers', 'Cost center', 'Cost centers', '/org/cost-centers', 'cost-center', 'Cost centers allocate expenses and payroll cost.');
export const employeeTypes = lookup('employee-types', 'Employee type', 'Employee types', '/org/employee-types', 'employee-type', 'For example Field, Office or Remote.');
export const employmentTypes = lookup('employment-types', 'Employment type', 'Employment types', '/org/employment-types', 'employment-type', 'For example Full-time, Contract or Intern.');
