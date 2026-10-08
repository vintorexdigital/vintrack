import { sql, type SQL } from 'drizzle-orm';
import type { DatasetMeta } from '@trackrex/schemas';

type Unit = 'count' | 'hours' | 'money' | 'percent' | 'number';

interface Dataset {
  key: string;
  label: string;
  description: string;
  /** Permission that governs who may read this data; its data scope narrows every query. */
  permission: string;
  /** Plan module the data belongs to. */
  module?: string;
  /** FROM clause. The employee is always `e`, the department `dep`. */
  from: (tz: string) => SQL;
  /** Column holding the employee that owns each row, for the data-scope predicate. */
  employee: SQL;
  /** The day a row belongs to, for the date range. */
  day: (tz: string) => SQL;
  dimensions: Record<string, { label: string; kind: 'text' | 'date' | 'month'; sql: (tz: string) => SQL }>;
  measures: Record<string, { label: string; unit: Unit; sql: SQL }>;
  filters: Record<string, { label: string; kind: 'text' | 'choice' | 'number'; options?: string[]; sql: (tz: string) => SQL }>;
}

const people = {
  employee: { label: 'Employee', kind: 'text', sql: () => sql`e.display_name` },
  department: { label: 'Department', kind: 'text', sql: () => sql`coalesce(dep.name, 'No department')` },
} as const;
const peopleFilters = {
  employee_name: { label: 'Employee name', kind: 'text', sql: () => sql`e.display_name` },
  department: { label: 'Department', kind: 'text', sql: () => sql`coalesce(dep.name, 'No department')` },
} as const;
const join = (col: SQL) => sql`join employees e on e.id = ${col} left join departments dep on dep.id = e.department_id`;
const local = (col: SQL, tz: string) => sql`(${col} at time zone ${tz})::date`;
const month = (day: SQL) => sql`to_char(${day}, 'YYYY-MM')`;

export const DATASETS: Dataset[] = [
  {
    key: 'attendance', label: 'Attendance', description: 'One row per person per day, as the attendance engine calculated it.',
    permission: 'attendance.day.read', module: 'attendance',
    from: () => sql`attendance_days x ${join(sql`x.employee_id`)}`, employee: sql`x.employee_id`, day: () => sql`x.date`,
    dimensions: {
      ...people,
      day: { label: 'Date', kind: 'date', sql: () => sql`x.date::text` },
      month: { label: 'Month', kind: 'month', sql: () => month(sql`x.date`) },
      status: { label: 'Day status', kind: 'text', sql: () => sql`x.status_code` },
    },
    measures: {
      days: { label: 'Days', unit: 'count', sql: sql`count(*)::float` },
      present_days: { label: 'Present days', unit: 'number', sql: sql`coalesce(sum(x.present_units), 0)::float` },
      absent_days: { label: 'Absent days', unit: 'number', sql: sql`coalesce(sum(x.absent_units), 0)::float` },
      leave_days: { label: 'Leave days', unit: 'number', sql: sql`coalesce(sum(x.leave_units), 0)::float` },
      worked_hours: { label: 'Hours worked', unit: 'hours', sql: sql`round(coalesce(sum(x.worked_minutes), 0) / 60.0, 1)::float` },
      avg_hours: { label: 'Average hours per day', unit: 'hours', sql: sql`round(coalesce(avg(nullif(x.worked_minutes, 0)), 0) / 60.0, 1)::float` },
      late_marks: { label: 'Late marks', unit: 'count', sql: sql`count(*) filter (where x.late_mark)::float` },
      late_minutes: { label: 'Late minutes', unit: 'number', sql: sql`coalesce(sum(x.late_minutes), 0)::float` },
      overtime_hours: { label: 'Overtime hours', unit: 'hours', sql: sql`round(coalesce(sum(x.overtime_minutes), 0) / 60.0, 1)::float` },
    },
    filters: { ...peopleFilters, status: { label: 'Day status', kind: 'choice', options: ['P', 'HP', 'AB', 'AH', 'L', 'HL', 'H', 'NW', 'LM', 'LMP', 'D', 'AP', 'PA', 'PUL', 'NJ', 'OA', 'ONW', 'OH'], sql: () => sql`x.status_code` } },
  },
  {
    key: 'leave', label: 'Leave', description: 'Leave requests, by the date the leave starts.',
    permission: 'leave.request.read', module: 'leave',
    from: () => sql`leave_requests x ${join(sql`x.employee_id`)} join leave_types lt on lt.id = x.leave_type_id`, employee: sql`x.employee_id`, day: () => sql`x.from_date`,
    dimensions: {
      ...people,
      leave_type: { label: 'Leave type', kind: 'text', sql: () => sql`lt.name` },
      status: { label: 'Status', kind: 'text', sql: () => sql`x.status` },
      month: { label: 'Month', kind: 'month', sql: () => month(sql`x.from_date`) },
    },
    measures: {
      requests: { label: 'Requests', unit: 'count', sql: sql`count(*)::float` },
      days: { label: 'Days', unit: 'number', sql: sql`coalesce(sum(x.days), 0)::float` },
      avg_days: { label: 'Average days per request', unit: 'number', sql: sql`round(coalesce(avg(x.days), 0)::numeric, 1)::float` },
    },
    filters: { ...peopleFilters, status: { label: 'Status', kind: 'choice', options: ['pending', 'approved', 'rejected', 'cancelled'], sql: () => sql`x.status` }, leave_type: { label: 'Leave type', kind: 'text', sql: () => sql`lt.name` } },
  },
  {
    key: 'expenses', label: 'Expenses', description: 'Expense claims, by the date of the expense.',
    permission: 'expenses.claim.read', module: 'expenses',
    from: () => sql`expenses x ${join(sql`x.employee_id`)} join expense_categories c on c.id = x.category_id`, employee: sql`x.employee_id`, day: () => sql`x.expense_date`,
    dimensions: {
      ...people,
      category: { label: 'Category', kind: 'text', sql: () => sql`c.name` },
      status: { label: 'Status', kind: 'text', sql: () => sql`x.status` },
      month: { label: 'Month', kind: 'month', sql: () => month(sql`x.expense_date`) },
    },
    measures: {
      claims: { label: 'Claims', unit: 'count', sql: sql`count(*)::float` },
      claimed: { label: 'Amount claimed', unit: 'money', sql: sql`coalesce(sum(x.amount), 0)::float` },
      approved: { label: 'Amount approved', unit: 'money', sql: sql`coalesce(sum(x.approved_amount) filter (where x.status in ('approved', 'paid')), 0)::float` },
      paid: { label: 'Amount paid', unit: 'money', sql: sql`coalesce(sum(x.approved_amount) filter (where x.status = 'paid'), 0)::float` },
      avg_claim: { label: 'Average claim', unit: 'money', sql: sql`round(coalesce(avg(x.amount), 0)::numeric, 2)::float` },
    },
    filters: { ...peopleFilters, status: { label: 'Status', kind: 'choice', options: ['pending', 'approved', 'rejected', 'paid', 'cancelled'], sql: () => sql`x.status` }, category: { label: 'Category', kind: 'text', sql: () => sql`c.name` } },
  },
  {
    key: 'tasks', label: 'Tasks', description: 'Field tasks, by the day they were due (or created, if they have no due date).',
    permission: 'field.task.read', module: 'tasks',
    from: () => sql`tasks x ${join(sql`x.assignee_id`)} left join customers cu on cu.id = x.customer_id`, employee: sql`x.assignee_id`, day: (tz) => local(sql`coalesce(x.due_at, x.created_at)`, tz),
    dimensions: {
      ...people,
      customer: { label: 'Customer', kind: 'text', sql: () => sql`coalesce(cu.name, 'No customer')` },
      task_type: { label: 'Task type', kind: 'text', sql: () => sql`x.task_type` },
      status: { label: 'Status', kind: 'text', sql: () => sql`x.status` },
      priority: { label: 'Priority', kind: 'text', sql: () => sql`x.priority` },
      month: { label: 'Month', kind: 'month', sql: (tz) => month(local(sql`coalesce(x.due_at, x.created_at)`, tz)) },
    },
    measures: {
      tasks: { label: 'Tasks', unit: 'count', sql: sql`count(*)::float` },
      completed: { label: 'Completed', unit: 'count', sql: sql`count(*) filter (where x.status = 'completed')::float` },
      overdue: { label: 'Overdue', unit: 'count', sql: sql`count(*) filter (where x.status in ('open', 'in_progress') and x.due_at < now())::float` },
      completion_rate: { label: 'Completion rate', unit: 'percent', sql: sql`round(100.0 * count(*) filter (where x.status = 'completed') / nullif(count(*) filter (where x.status <> 'cancelled'), 0))::float` },
      avg_distance: { label: 'Average distance at check-in (m)', unit: 'number', sql: sql`round(coalesce(avg(x.check_in_distance_m), 0)::numeric)::float` },
    },
    filters: { ...peopleFilters, status: { label: 'Status', kind: 'choice', options: ['open', 'in_progress', 'completed', 'cancelled'], sql: () => sql`x.status` }, task_type: { label: 'Task type', kind: 'choice', options: ['visit', 'call', 'delivery', 'collection', 'survey', 'other'], sql: () => sql`x.task_type` }, customer: { label: 'Customer', kind: 'text', sql: () => sql`cu.name` } },
  },
  {
    key: 'leads', label: 'Leads', description: 'Sales leads, by the day they were created.',
    permission: 'sales.lead.read', module: 'leads',
    from: () => sql`leads x ${join(sql`x.owner_id`)}`, employee: sql`x.owner_id`, day: (tz) => local(sql`x.created_at`, tz),
    dimensions: {
      owner: { label: 'Owner', kind: 'text', sql: () => sql`e.display_name` },
      department: people.department,
      stage: { label: 'Stage', kind: 'text', sql: () => sql`x.stage` },
      source: { label: 'Source', kind: 'text', sql: () => sql`x.source` },
      month: { label: 'Month created', kind: 'month', sql: (tz) => month(local(sql`x.created_at`, tz)) },
    },
    measures: {
      leads: { label: 'Leads', unit: 'count', sql: sql`count(*)::float` },
      value: { label: 'Expected value', unit: 'money', sql: sql`coalesce(sum(x.value), 0)::float` },
      won: { label: 'Won', unit: 'count', sql: sql`count(*) filter (where x.stage = 'won')::float` },
      won_value: { label: 'Won value', unit: 'money', sql: sql`coalesce(sum(x.value) filter (where x.stage = 'won'), 0)::float` },
      win_rate: { label: 'Won of closed', unit: 'percent', sql: sql`round(100.0 * count(*) filter (where x.stage = 'won') / nullif(count(*) filter (where x.stage in ('won', 'lost')), 0))::float` },
    },
    filters: { ...peopleFilters, stage: { label: 'Stage', kind: 'choice', options: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'], sql: () => sql`x.stage` }, source: { label: 'Source', kind: 'choice', options: ['manual', 'web_form', 'referral', 'campaign', 'walk_in', 'other'], sql: () => sql`x.source` } },
  },
  {
    key: 'calls', label: 'Calls', description: 'The call log, by the day of the call.',
    permission: 'calls.call.read', module: 'call_log',
    from: () => sql`call_logs x ${join(sql`x.employee_id`)}`, employee: sql`x.employee_id`, day: (tz) => local(sql`x.started_at`, tz),
    dimensions: {
      ...people,
      direction: { label: 'Direction', kind: 'text', sql: () => sql`x.direction` },
      outcome: { label: 'Outcome', kind: 'text', sql: () => sql`x.outcome` },
      day: { label: 'Date', kind: 'date', sql: (tz) => sql`${local(sql`x.started_at`, tz)}::text` },
      month: { label: 'Month', kind: 'month', sql: (tz) => month(local(sql`x.started_at`, tz)) },
    },
    measures: {
      calls: { label: 'Calls', unit: 'count', sql: sql`count(*)::float` },
      connected: { label: 'Connected', unit: 'count', sql: sql`count(*) filter (where x.outcome = 'connected')::float` },
      talk_minutes: { label: 'Talk time (minutes)', unit: 'number', sql: sql`round((coalesce(sum(x.duration_seconds), 0) / 60.0)::numeric, 1)::float` },
      avg_minutes: { label: 'Average call (minutes)', unit: 'number', sql: sql`round((coalesce(avg(nullif(x.duration_seconds, 0)), 0) / 60.0)::numeric, 1)::float` },
    },
    filters: { ...peopleFilters, direction: { label: 'Direction', kind: 'choice', options: ['outgoing', 'incoming', 'missed'], sql: () => sql`x.direction` }, outcome: { label: 'Outcome', kind: 'choice', options: ['connected', 'no_answer', 'busy', 'voicemail', 'wrong_number'], sql: () => sql`x.outcome` } },
  },
];

export const datasetByKey = (k: string): Dataset | undefined => DATASETS.find((d) => d.key === k);

export function metaOf(d: Dataset): DatasetMeta {
  return {
    key: d.key, label: d.label, description: d.description,
    dimensions: Object.entries(d.dimensions).map(([key, v]) => ({ key, label: v.label, kind: v.kind })),
    measures: Object.entries(d.measures).map(([key, v]) => ({ key, label: v.label, unit: v.unit })),
    filters: Object.entries(d.filters).map(([key, v]) => ({ key, label: v.label, kind: v.kind, ...(v.options ? { options: v.options } : {}) })),
  };
}
