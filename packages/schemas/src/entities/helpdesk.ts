import { defineEntity, f } from '../entity.js';

export const TICKET_CATEGORIES = ['it', 'hr', 'admin', 'facilities', 'finance', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;

export const tickets = defineEntity({
  key: 'tickets', singular: 'Ticket', plural: 'Tickets', module: 'helpdesk', resource: 'ticket',
  path: '/helpdesk/tickets', codePrefix: 'HD', titleField: 'subject', defaultSort: '-createdAt', scoped: 'employee', ownerColumn: 'requesterId', licenseModule: 'help_desk',
  fields: {
    subject: f.text('Subject', { required: true, list: true, search: true, maxLength: 160 }),
    description: f.textarea('What do you need?', { maxLength: 4000 }),
    requesterId: f.ref('Raised by', 'employees', { required: true, list: true, filter: true, immutable: true }),
    category: f.select('Category', TICKET_CATEGORIES, { required: true, default: 'it', list: true, filter: true }),
    priority: f.select('Priority', TICKET_PRIORITIES, { default: 'normal', list: true, filter: true, sort: true }),
    status: f.select('Status', TICKET_STATUSES, { default: 'open', list: true, filter: true, hideInForm: true, immutable: true }),
    assigneeId: f.ref('Assigned to', 'employees', { list: true, filter: true, hideInForm: true }),
    firstResponseDueAt: f.datetime('First reply due', { hideInForm: true, immutable: true }),
    resolutionDueAt: f.datetime('Resolve by', { list: true, sort: true, hideInForm: true, immutable: true }),
    firstRespondedAt: f.datetime('First replied', { hideInForm: true, immutable: true }),
    resolvedAt: f.datetime('Resolved', { hideInForm: true, immutable: true }),
    rating: f.number('Rating', { min: 1, max: 5, hideInForm: true, immutable: true }),
  },
  empty: { title: 'No tickets', hint: 'Raise a request for IT, HR, admin or facilities and follow it here.' },
});

export const ASSET_CATEGORIES = ['laptop', 'phone', 'vehicle', 'id_card', 'furniture', 'other'] as const;
export const assets = defineEntity({
  key: 'assets', singular: 'Asset', plural: 'Assets', module: 'helpdesk', resource: 'asset',
  path: '/helpdesk/assets', codePrefix: 'AST', titleField: 'name', defaultSort: 'name', licenseModule: 'assets',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    category: f.select('Category', ASSET_CATEGORIES, { required: true, default: 'laptop', list: true, filter: true }),
    serial: f.text('Serial or tag number', { list: true, search: true }),
    purchaseDate: f.date('Purchased on'),
    cost: f.number('Cost', { min: 0, max: 1_000_000_000 }),
    status: f.select('Status', ['in_stock', 'assigned', 'repair', 'retired'], { default: 'in_stock', list: true, filter: true, hideInForm: true, immutable: true }),
    assignedToId: f.ref('With', 'employees', { list: true, filter: true, hideInForm: true, immutable: true }),
    notes: f.textarea('Notes'),
  },
  empty: { title: 'No assets yet', hint: 'Record laptops, phones and other equipment, and who has them.' },
});
