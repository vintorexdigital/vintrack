import { z } from 'zod';
import { uuid } from './common.js';

export interface TriggerDef {
  type: string;
  label: string;
  /** Fields a condition can test, besides the person's own details (`employee.*`). */
  fields: { path: string; label: string; kind: 'text' | 'number' | 'date' }[];
}

const emp = (path: string, label: string) => ({ path: `employee.${path}`, label, kind: 'text' as const });
/** Properties of the person the event is about, available to every trigger. */
export const EMPLOYEE_FIELDS = [emp('departmentId', 'Department'), emp('designationId', 'Designation'), emp('workLocationId', 'Work location'), emp('employeeTypeId', 'Employee type'), emp('status', 'Employment status')];

export const WORKFLOW_TRIGGERS: TriggerDef[] = [
  { type: 'leave.requested', label: 'A leave request is submitted', fields: [{ path: 'payload.from', label: 'From date', kind: 'date' }, { path: 'payload.to', label: 'To date', kind: 'date' }] },
  { type: 'leave.approved', label: 'A leave request is approved', fields: [] },
  { type: 'leave.rejected', label: 'A leave request is rejected', fields: [] },
  { type: 'regularization.requested', label: 'A regularization is requested', fields: [{ path: 'payload.date', label: 'Date', kind: 'date' }] },
  { type: 'regularization.approved', label: 'A regularization is approved', fields: [] },
  { type: 'regularization.rejected', label: 'A regularization is rejected', fields: [] },
  { type: 'expense.submitted', label: 'An expense claim is submitted', fields: [{ path: 'payload.amount', label: 'Amount', kind: 'number' }, { path: 'payload.currency', label: 'Currency', kind: 'text' }] },
  { type: 'expense.approved', label: 'An expense claim is approved', fields: [{ path: 'payload.amount', label: 'Approved amount', kind: 'number' }] },
  { type: 'expense.rejected', label: 'An expense claim is rejected', fields: [] },
  { type: 'expense.paid', label: 'An expense claim is paid', fields: [{ path: 'payload.amount', label: 'Amount', kind: 'number' }] },
  { type: 'task.assigned', label: 'A task is assigned', fields: [{ path: 'payload.title', label: 'Task title', kind: 'text' }] },
  { type: 'task.completed', label: 'A task is completed', fields: [{ path: 'payload.title', label: 'Task title', kind: 'text' }] },
  { type: 'task.cancelled', label: 'A task is cancelled', fields: [{ path: 'payload.title', label: 'Task title', kind: 'text' }] },
  { type: 'lead.assigned', label: 'A lead is assigned', fields: [{ path: 'payload.title', label: 'Lead name', kind: 'text' }] },
  { type: 'lead.stage_changed', label: 'A lead changes stage', fields: [{ path: 'payload.stage', label: 'New stage', kind: 'text' }] },
  { type: 'lead.converted', label: 'A lead becomes a customer', fields: [] },
  { type: 'punch.in', label: 'Someone punches in', fields: [{ path: 'payload.source', label: 'Source (mobile, web, desktop)', kind: 'text' }] },
  { type: 'punch.out', label: 'Someone punches out', fields: [] },
  { type: 'punch.auto_out', label: 'Someone is punched out automatically', fields: [] },
  { type: 'employee.exited', label: 'An employee exits', fields: [] },
];
export const TRIGGER_TYPES = WORKFLOW_TRIGGERS.map((t) => t.type) as [string, ...string[]];

export const conditionSchema = z.object({
  path: z.string().regex(/^(payload|employee)\.[a-zA-Z0-9_.]{1,60}$/, 'Choose a field'),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists']),
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(100)).max(50)]).optional(),
});
export const conditionsSchema = z.array(conditionSchema).max(10);

/** Who a step is aimed at, worked out from the event when the step runs. */
export const recipientSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('subject_employee') }),
  z.object({ kind: z.literal('manager') }),
  z.object({ kind: z.literal('manager_chain'), level: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal('employee'), employeeId: uuid }),
  z.object({ kind: z.literal('role'), roleKey: z.string().min(1).max(60) }),
]);
export type Recipient = z.infer<typeof recipientSchema>;

export const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notify'), to: recipientSchema, title: z.string().trim().min(1).max(120), body: z.string().trim().max(300).optional() }),
  z.object({
    type: z.literal('create_task'), assignTo: recipientSchema, title: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(),
    dueInHours: z.number().min(1).max(24 * 60).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  }),
  z.object({ type: z.literal('delay'), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  z.object({ type: z.literal('webhook'), url: z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https address'), includePayload: z.boolean().default(true) }),
  z.object({ type: z.literal('approval'), approver: recipientSchema, title: z.string().trim().min(1).max(120), body: z.string().trim().max(300).optional() }),
]);
export type WorkflowStep = z.infer<typeof stepSchema>;
export const stepsSchema = z.array(stepSchema).min(1, 'Add at least one step').max(10);

export const approvalDecisionBody = z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().trim().max(300).optional() });
