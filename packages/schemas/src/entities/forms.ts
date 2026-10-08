import { defineEntity, f } from '../entity.js';
import { questionsSchema } from '../forms.js';

export const TASK_TYPES = ['visit', 'call', 'delivery', 'collection', 'survey', 'other'] as const;

export const formTemplates = defineEntity({
  key: 'form-templates', singular: 'Task form', plural: 'Task forms', module: 'field', resource: 'form',
  path: '/field/forms', titleField: 'name', defaultSort: 'name', licenseModule: 'tasks',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    description: f.textarea('Description'),
    status: f.select('Status', ['active', 'archived'], { default: 'active', list: true, filter: true }),
    taskTypes: f.multiselect('Attach automatically to', TASK_TYPES, { help: 'New tasks of these types get this form. You can also attach it to any task by hand.' }),
    requiredToComplete: f.boolean('Must be submitted to complete the task', { default: true, list: true }),
    questions: f.json('Questions', questionsSchema, { required: true, editor: 'form-builder', section: 'Questions' }),
  },
  empty: { title: 'No task forms yet', hint: 'Build a checklist or survey that field staff fill in on the task.' },
});
