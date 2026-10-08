import { z } from 'zod';
import { defineEntity, f } from '../entity.js';
import { uuid } from '../common.js';

export const expenseCategories = defineEntity({
  key: 'expense-categories', singular: 'Expense category', plural: 'Expense categories', module: 'expenses', resource: 'category',
  path: '/admin/expenses/categories', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'expenses',
  fields: {
    name: f.text('Category', { required: true, list: true, sort: true, search: true }),
    maxAmount: f.number('Limit per claim', { min: 0, list: true, help: 'Claims above this amount are refused. Leave empty for no limit.' }),
    noteRequired: f.boolean('Require a description', { default: false, list: true }),
    status: f.select('Status', ['active', 'inactive'], { default: 'active', list: true, filter: true, sort: true }),
  },
  empty: { title: 'No expense categories', hint: 'Add categories such as Travel, Fuel or Meals so employees can classify claims.' },
});

export const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'paid', 'cancelled'] as const;
export const expenseClaims = defineEntity({
  key: 'expenses', singular: 'Expense claim', plural: 'Expense claims', module: 'expenses', resource: 'claim',
  path: '/expenses/claims', codePrefix: 'EXP', titleField: 'code', defaultSort: '-expenseDate', scoped: 'employee', ownerColumn: 'employeeId', licenseModule: 'expenses',
  fields: {
    employeeId: f.ref('Employee', 'employees', { required: true, list: true, filter: true, immutable: true }),
    categoryId: f.ref('Category', 'expense-categories', { required: true, list: true, filter: true }),
    expenseDate: f.date('Expense date', { required: true, list: true, sort: true, filter: true }),
    amount: f.number('Amount', { required: true, min: 0.01, max: 100_000_000, list: true, sort: true }),
    currency: f.text('Currency', { hideInForm: true, maxLength: 3 }),
    merchant: f.text('Paid to', { list: true, search: true }),
    description: f.textarea('Description', { search: true }),
    customerId: f.ref('Customer', 'customers', { filter: true }),
    status: f.select('Status', CLAIM_STATUSES, { default: 'pending', list: true, filter: true, sort: true, hideInForm: true, immutable: true }),
    approvedAmount: f.number('Approved amount', { hideInForm: true, immutable: true, min: 0 }),
    actionBy: f.ref('Actioned by', 'employees', { hideInForm: true, immutable: true }),
    actionAt: f.datetime('Actioned on', { hideInForm: true, immutable: true }),
    actionComment: f.textarea('Action comment', { hideInForm: true, immutable: true }),
    paidAt: f.datetime('Paid on', { hideInForm: true, immutable: true }),
    paymentReference: f.text('Payment reference', { hideInForm: true, immutable: true }),
  },
  empty: { title: 'No expense claims', hint: 'Claim travel, fuel and other costs, then follow them to reimbursement.' },
});

export const expenseDecisionBody = z.object({
  comment: z.string().trim().max(500).optional(),
  approvedAmount: z.number().min(0).optional(),
});
export const expensePayBody = z.object({ reference: z.string().trim().max(120).optional() });
export const bulkExpenseBody = z.object({ ids: z.array(uuid).min(1).max(200), comment: z.string().trim().max(500).optional() });
