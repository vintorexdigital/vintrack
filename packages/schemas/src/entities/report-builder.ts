import { defineEntity, f } from '../entity.js';
import { reportDefinitionSchema, widgetsSchema } from '../report-builder.js';

export const savedReports = defineEntity({
  key: 'saved-reports', singular: 'Saved report', plural: 'Saved reports', module: 'reports', resource: 'builder',
  path: '/report-builder/reports', titleField: 'name', defaultSort: 'name', licenseModule: 'advanced_analytics',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    description: f.textarea('What it shows'),
    visibility: f.select('Who can open it', [{ value: 'private', label: 'Only me' }, { value: 'company', label: 'Everyone who can see reports' }], { default: 'private', list: true, filter: true, help: 'Whoever opens it sees only the people they are allowed to see.' }),
    definition: f.json('Report', reportDefinitionSchema, { required: true, editor: 'report-definition', section: 'Report' }),
  },
  empty: { title: 'No saved reports yet', hint: 'Build a report from attendance, leave, expenses, tasks, leads or calls and save it to reuse or put on a dashboard.' },
});

export const dashboards = defineEntity({
  key: 'dashboards', singular: 'Dashboard', plural: 'Dashboards', module: 'reports', resource: 'dashboard',
  path: '/report-builder/dashboards', titleField: 'name', defaultSort: 'name', licenseModule: 'advanced_analytics',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    description: f.textarea('What it is for'),
    visibility: f.select('Who can open it', [{ value: 'private', label: 'Only me' }, { value: 'company', label: 'Everyone who can see reports' }], { default: 'private', list: true, filter: true }),
    widgets: f.json('Widgets', widgetsSchema, { default: [], editor: 'dashboard-widgets', section: 'Widgets' }),
  },
  empty: { title: 'No dashboards yet', hint: 'Arrange saved reports as charts and numbers on one page.' },
});
