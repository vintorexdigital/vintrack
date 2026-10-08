import { z } from 'zod';
import { defineEntity, f } from '../entity.js';

export const salaryStructures = defineEntity({
  key: 'salary-structures', singular: 'Salary structure', plural: 'Salary structures', module: 'payroll', resource: 'salary',
  path: '/payroll/salary-structures', titleField: 'employeeId', defaultSort: '-effectiveFrom', licenseModule: 'payroll', softDelete: false,
  fields: {
    employeeId: f.ref('Employee', 'employees', { required: true, list: true, filter: true, immutable: true }),
    effectiveFrom: f.date('Effective from', { required: true, list: true, sort: true, help: 'The structure in force on the last day of a pay cycle is the one used.' }),
    basic: f.number('Basic (monthly)', { required: true, min: 0, max: 100_000_000, list: true }),
    hra: f.number('House rent allowance (monthly)', { min: 0, max: 100_000_000, default: 0 }),
    specialAllowance: f.number('Special allowance (monthly)', { min: 0, max: 100_000_000, default: 0 }),
    otherAllowance: f.number('Other allowances (monthly)', { min: 0, max: 100_000_000, default: 0 }),
    pfEnabled: f.boolean('Provident fund applies', { default: true }),
    esiEnabled: f.boolean('State insurance applies', { default: false, help: 'Taken only while monthly gross pay is within the statutory limit.' }),
    professionalTax: f.number('Professional tax (monthly)', { min: 0, max: 100_000, default: 0 }),
    otherDeductions: f.number('Other deductions (monthly)', { min: 0, max: 100_000_000, default: 0, help: 'For example a loan instalment or advance recovery.' }),
    notes: f.textarea('Notes'),
  },
  empty: { title: 'No salary structures yet', hint: 'Give each employee a salary structure before running payroll.' },
});

export const onboardingItemsSchema = z.array(z.object({
  title: z.string().trim().min(1).max(160),
  who: z.enum(['employee', 'manager', 'hr', 'it', 'admin']).default('hr'),
  dueDays: z.number().int().min(0).max(365).default(0),
})).min(1, 'Add at least one step').max(40);
export type OnboardingItemDef = z.infer<typeof onboardingItemsSchema>[number];

export const onboardingTemplates = defineEntity({
  key: 'onboarding-templates', singular: 'Checklist template', plural: 'Checklist templates', module: 'onboarding', resource: 'template',
  path: '/onboarding/templates', titleField: 'name', defaultSort: 'name', licenseModule: 'onboarding',
  fields: {
    name: f.text('Name', { required: true, list: true, search: true, sort: true }),
    kind: f.select('For', [{ value: 'joining', label: 'New joiners' }, { value: 'exit', label: 'People leaving' }], { default: 'joining', list: true, filter: true }),
    status: f.select('Status', ['active', 'archived'], { default: 'active', list: true, filter: true }),
    items: f.json('Steps', onboardingItemsSchema, { required: true, editor: 'checklist-items', section: 'Steps' }),
  },
  empty: { title: 'No checklist templates yet', hint: 'Write down what has to happen when someone joins or leaves, once.' },
});
