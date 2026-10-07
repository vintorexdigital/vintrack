import { defineEntity, f } from '../entity.js';
import { conditionsSchema, stepsSchema, WORKFLOW_TRIGGERS } from '../workflow.js';

export const workflows = defineEntity({
  key: 'workflows', singular: 'Workflow', plural: 'Workflows', module: 'automation', resource: 'workflow',
  path: '/automation/workflows', titleField: 'name', defaultSort: 'name', licenseModule: 'workflows',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    description: f.textarea('What it is for'),
    status: f.select('Status', ['draft', 'active', 'paused'], { default: 'draft', list: true, filter: true, help: 'Only active workflows run.' }),
    trigger: f.select('When', WORKFLOW_TRIGGERS.map((t) => ({ value: t.type, label: t.label })), { required: true, list: true, filter: true }),
    conditions: f.json('Only if', conditionsSchema, { default: [], editor: 'workflow-conditions', section: 'Conditions' }),
    steps: f.json('Then', stepsSchema, { required: true, editor: 'workflow-steps', section: 'Steps' }),
  },
  empty: { title: 'No workflows yet', hint: 'Automate a reminder, an extra approval or a follow-up task when something happens.' },
});
