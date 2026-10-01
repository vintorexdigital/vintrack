import { z } from 'zod';
import { defineEntity, f } from '../entity.js';

export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export const leads = defineEntity({
  key: 'leads', singular: 'Lead', plural: 'Leads', module: 'sales', resource: 'lead',
  path: '/sales/leads', codePrefix: 'LEAD', titleField: 'name', defaultSort: 'nextFollowUpAt', scoped: 'employee', ownerColumn: 'ownerId', licenseModule: 'leads',
  fields: {
    name: f.text('Contact name', { required: true, list: true, search: true }),
    companyName: f.text('Company', { list: true, search: true }),
    phone: f.phone('Phone', { list: true, search: true }),
    email: f.email('Email', { search: true }),
    source: f.select('Source', ['manual', 'web_form', 'referral', 'campaign', 'walk_in', 'other'], { default: 'manual', list: true, filter: true }),
    stage: f.select('Stage', LEAD_STAGES, { default: 'new', list: true, filter: true, sort: true, hideInForm: true, immutable: true }),
    ownerId: f.ref('Owner', 'employees', { required: true, list: true, filter: true }),
    value: f.number('Expected value', { min: 0, max: 1_000_000_000, list: true, sort: true }),
    nextFollowUpAt: f.datetime('Next follow-up', { list: true, sort: true, filter: true }),
    lostReason: f.text('Lost because', { hideInForm: true, immutable: true }),
    convertedCustomerId: f.ref('Customer', 'customers', { hideInForm: true, immutable: true }),
    notes: f.textarea('Notes'),
  },
  empty: { title: 'No leads yet', hint: 'Capture prospects, follow them up, and turn the ones you win into customers.' },
});

export const leadStageBody = z.object({
  stage: z.enum(LEAD_STAGES),
  reason: z.string().trim().max(300).optional(),
  nextFollowUpAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const callLogs = defineEntity({
  key: 'call-logs', singular: 'Call', plural: 'Call log', module: 'calls', resource: 'call',
  path: '/field/calls', titleField: 'phone', defaultSort: '-startedAt', scoped: 'employee', ownerColumn: 'employeeId', licenseModule: 'call_log',
  fields: {
    employeeId: f.ref('Employee', 'employees', { required: true, list: true, filter: true, immutable: true }),
    direction: f.select('Direction', ['outgoing', 'incoming', 'missed'], { required: true, default: 'outgoing', list: true, filter: true }),
    phone: f.phone('Number', { required: true, list: true, search: true }),
    startedAt: f.datetime('Started', { required: true, list: true, sort: true, filter: true }),
    durationSeconds: f.number('Duration (seconds)', { min: 0, max: 86_400, default: 0, list: true }),
    outcome: f.select('Outcome', ['connected', 'no_answer', 'busy', 'voicemail', 'wrong_number'], { default: 'connected', list: true, filter: true }),
    customerId: f.ref('Customer', 'customers', { filter: true }),
    leadId: f.ref('Lead', 'leads', { filter: true }),
    notes: f.textarea('Notes'),
  },
  empty: { title: 'No calls logged', hint: 'Log calls to customers and leads so the history stays with the account.' },
});
