import { sql, type SQL } from 'drizzle-orm';

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'hours' | 'percent';
  /** Total this column in the footer row. */
  sum?: boolean;
}

export interface ReportParams {
  from: string;
  to: string;
  departmentId?: string;
  workLocationId?: string;
  employeeId?: string;
}

/** Fragments every report shares: the employee filter, already narrowed by the viewer's data scope. */
export interface ReportContext {
  params: ReportParams;
  /** The company's timezone, for turning instants into local dates. */
  timezone: string;
  /** WHERE conditions on `e` (employees), joined with AND. Always present, may be `true`. */
  employees: SQL;
}

export interface ReportDef {
  key: string;
  name: string;
  description: string;
  category: 'Attendance' | 'Leave' | 'Field' | 'People';
  columns: ReportColumn[];
  /** Largest range the report accepts, in days, to keep queries cheap. */
  maxDays: number;
  sql(ctx: ReportContext): SQL;
}

const emp = [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'employee', label: 'Employee', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
] satisfies ReportColumn[];

const who = sql`e.code as code, e.display_name as employee, d.name as department`;
const from = sql`from employees e left join departments d on d.id = e.department_id`;

export const REPORTS: ReportDef[] = [
  {
    key: 'desktop-activity', name: 'Desktop activity', category: 'People', maxDays: 93,
    description: 'Recorded, idle and productive time per employee from the desktop agent. Applications and websites are classified by the company.',
    columns: [...emp, { key: 'recorded', label: 'Recorded', type: 'hours', sum: true }, { key: 'idle', label: 'Idle', type: 'hours', sum: true }, { key: 'productive', label: 'Productive', type: 'hours', sum: true }, { key: 'unproductive', label: 'Unproductive', type: 'hours', sum: true }, { key: 'neutral', label: 'Neutral', type: 'hours', sum: true }],
    sql: ({ params, employees, timezone }) => sql`
      select ${who},
        coalesce(sum(b.seconds), 0)::float / 3600 as recorded, coalesce(sum(b.idle_seconds), 0)::float / 3600 as idle,
        coalesce(sum(greatest(b.seconds - b.idle_seconds, 0)) filter (where coalesce(dc.app_class, ac.app_class, 'neutral') = 'productive'), 0)::float / 3600 as productive,
        coalesce(sum(greatest(b.seconds - b.idle_seconds, 0)) filter (where coalesce(dc.app_class, ac.app_class, 'neutral') = 'unproductive'), 0)::float / 3600 as unproductive,
        coalesce(sum(greatest(b.seconds - b.idle_seconds, 0)) filter (where coalesce(dc.app_class, ac.app_class, 'neutral') = 'neutral'), 0)::float / 3600 as neutral
      ${from} join activity_buckets b on b.employee_id = e.id and (b.start_at at time zone ${timezone})::date between ${params.from}::date and ${params.to}::date
      left join app_classes dc on b.domain is not null and dc.kind = 'domain' and lower(dc.name) = lower(b.domain) and dc.deleted_at is null
      left join app_classes ac on dc.id is null and ac.kind = 'app' and lower(ac.name) = lower(b.app) and ac.deleted_at is null
      where e.deleted_at is null and ${employees} group by e.id, d.name order by e.display_name`,
  },
  {
    key: 'expense-summary', name: 'Expense summary', category: 'People', maxDays: 366,
    description: 'Claimed, approved and paid amounts per employee for expenses dated in the period.',
    columns: [...emp, { key: 'claims', label: 'Claims', type: 'number', sum: true }, { key: 'claimed', label: 'Claimed', type: 'number', sum: true }, { key: 'approved', label: 'Approved', type: 'number', sum: true }, { key: 'paid', label: 'Paid', type: 'number', sum: true }, { key: 'pending', label: 'Awaiting decision', type: 'number', sum: true }],
    sql: ({ params, employees }) => sql`
      select ${who}, count(x.id)::int as claims, coalesce(sum(x.amount) filter (where x.status <> 'cancelled'), 0)::float as claimed,
             coalesce(sum(x.approved_amount) filter (where x.status in ('approved','paid')), 0)::float as approved, coalesce(sum(x.approved_amount) filter (where x.status = 'paid'), 0)::float as paid,
             coalesce(sum(x.amount) filter (where x.status = 'pending'), 0)::float as pending
      ${from} join expenses x on x.employee_id = e.id and x.deleted_at is null and x.expense_date between ${params.from}::date and ${params.to}::date
      where e.deleted_at is null and ${employees} group by e.id, d.name order by e.display_name`,
  },
  {
    key: 'attendance-summary', name: 'Attendance summary', category: 'Attendance', maxDays: 366,
    description: 'Days present, absent and on leave, late marks, deductions and hours worked, per employee.',
    columns: [...emp,
      { key: 'present', label: 'Present days', type: 'number', sum: true }, { key: 'absent', label: 'Absent days', type: 'number', sum: true }, { key: 'leave', label: 'Leave days', type: 'number', sum: true },
      { key: 'lateMarks', label: 'Late marks', type: 'number', sum: true }, { key: 'deductions', label: 'Deduction days', type: 'number', sum: true },
      { key: 'workedHours', label: 'Worked', type: 'hours', sum: true }, { key: 'overtimeHours', label: 'Overtime', type: 'hours', sum: true }],
    sql: ({ params, employees }) => sql`
      select ${who},
        coalesce(sum(a.present_units), 0)::float as present, coalesce(sum(a.absent_units), 0)::float as absent, coalesce(sum(a.leave_units), 0)::float as leave,
        count(*) filter (where a.late_mark)::int as "lateMarks", coalesce(sum(a.deduction_units), 0)::float as deductions,
        coalesce(sum(a.worked_minutes), 0)::float / 60 as "workedHours", coalesce(sum(a.overtime_minutes), 0)::float / 60 as "overtimeHours"
      ${from} left join attendance_days a on a.employee_id = e.id and a.date between ${params.from}::date and ${params.to}::date
      where e.deleted_at is null and ${employees} group by e.id, d.name order by e.display_name`,
  },
  {
    key: 'late-arrivals', name: 'Late arrivals', category: 'Attendance', maxDays: 366,
    description: 'Who is late most often and by how much. Employees with no late marks are left out.',
    columns: [...emp, { key: 'lateDays', label: 'Late days', type: 'number', sum: true }, { key: 'totalMinutes', label: 'Total late (min)', type: 'number', sum: true }, { key: 'averageMinutes', label: 'Average late (min)', type: 'number' }, { key: 'worstMinutes', label: 'Worst day (min)', type: 'number' }],
    sql: ({ params, employees }) => sql`
      select ${who}, count(*)::int as "lateDays", sum(a.late_minutes)::int as "totalMinutes", round(avg(a.late_minutes))::int as "averageMinutes", max(a.late_minutes)::int as "worstMinutes"
      ${from} join attendance_days a on a.employee_id = e.id and a.date between ${params.from}::date and ${params.to}::date and a.late_minutes > 0
      where e.deleted_at is null and ${employees} group by e.id, d.name order by count(*) desc, sum(a.late_minutes) desc`,
  },
  {
    key: 'leave-taken', name: 'Leave taken', category: 'Leave', maxDays: 366,
    description: 'Days of leave taken per employee and leave type in the period.',
    columns: [...emp, { key: 'leaveType', label: 'Leave type', type: 'text' }, { key: 'days', label: 'Days taken', type: 'number', sum: true }],
    sql: ({ params, employees }) => sql`
      select ${who}, t.name as "leaveType", sum(l.days)::float as days
      ${from} join leave_ledger l on l.employee_id = e.id and l.kind = 'taken' and l.date between ${params.from}::date and ${params.to}::date
      join leave_types t on t.id = l.leave_type_id
      where e.deleted_at is null and ${employees} group by e.id, d.name, t.name order by e.display_name, t.name`,
  },
  {
    key: 'task-performance', name: 'Task performance', category: 'Field', maxDays: 366,
    description: 'Tasks due in the period: how many were completed, are still open or overdue, and how close check-ins were.',
    columns: [...emp, { key: 'assigned', label: 'Assigned', type: 'number', sum: true }, { key: 'completed', label: 'Completed', type: 'number', sum: true }, { key: 'open', label: 'Still open', type: 'number', sum: true }, { key: 'overdue', label: 'Overdue', type: 'number', sum: true }, { key: 'completionRate', label: 'Completion', type: 'percent' }, { key: 'avgDistance', label: 'Avg check-in distance (m)', type: 'number' }],
    sql: ({ params, employees }) => sql`
      select ${who}, count(t.id)::int as assigned, count(*) filter (where t.status = 'completed')::int as completed,
        count(*) filter (where t.status in ('open','in_progress'))::int as open, count(*) filter (where t.status in ('open','in_progress') and t.due_at < now())::int as overdue,
        case when count(t.id) = 0 then null else round(100.0 * count(*) filter (where t.status = 'completed') / count(t.id)) end::float as "completionRate",
        round(avg(t.check_in_distance_m))::float as "avgDistance"
      ${from} join tasks t on t.assignee_id = e.id and t.deleted_at is null and t.status <> 'cancelled' and coalesce(t.due_at, t.created_at)::date between ${params.from}::date and ${params.to}::date
      where e.deleted_at is null and ${employees} group by e.id, d.name order by e.display_name`,
  },
  {
    key: 'field-travel', name: 'Field travel', category: 'Field', maxDays: 31,
    description: 'Distance covered per employee per day from location points recorded during working time. Points with poor accuracy or impossible jumps are ignored.',
    columns: [...emp, { key: 'day', label: 'Date', type: 'date' }, { key: 'km', label: 'Distance (km)', type: 'number', sum: true }, { key: 'points', label: 'Points', type: 'number', sum: true }, { key: 'firstAt', label: 'First point', type: 'text' }, { key: 'lastAt', label: 'Last point', type: 'text' }],
    sql: ({ params, employees, timezone }) => sql`
      with p as (
        select employee_id, at, latitude as lat, longitude as lng,
               lag(latitude) over w as plat, lag(longitude) over w as plng, lag(at) over w as pat
          from location_pings
         where mock = false and coalesce(accuracy, 0) <= 100 and at >= ${params.from}::date and at < (${params.to}::date + 1)
        window w as (partition by employee_id order by at)
      ), step as (
        select employee_id, (at at time zone ${timezone})::date as day, at,
               case when plat is null or at - pat > interval '30 minutes' then 0
                    else 2 * 6371000 * asin(least(1, sqrt(power(sin(radians(lat - plat) / 2), 2) + cos(radians(plat)) * cos(radians(lat)) * power(sin(radians(lng - plng) / 2), 2)))) end as meters,
               extract(epoch from at - pat) as secs
          from p
      )
      select ${who}, s.day::text as day, round((sum(s.meters) filter (where s.meters < 70 * greatest(s.secs, 1)) / 1000)::numeric, 2)::float as km, count(*)::int as points,
             to_char(min(s.at) at time zone ${timezone}, 'HH24:MI') as "firstAt", to_char(max(s.at) at time zone ${timezone}, 'HH24:MI') as "lastAt"
      ${from} join step s on s.employee_id = e.id
      where e.deleted_at is null and ${employees} group by e.id, d.name, s.day order by s.day desc, e.display_name`,
  },
  {
    key: 'headcount', name: 'Headcount', category: 'People', maxDays: 3660,
    description: 'Active people by department, with joiners and leavers in the period.',
    columns: [{ key: 'department', label: 'Department', type: 'text' }, { key: 'active', label: 'Active', type: 'number', sum: true }, { key: 'joiners', label: 'Joined in period', type: 'number', sum: true }, { key: 'leavers', label: 'Left in period', type: 'number', sum: true }],
    sql: ({ params, employees }) => sql`
      select coalesce(d.name, 'No department') as department, count(*) filter (where e.status = 'active')::int as active,
             count(*) filter (where e.date_of_joining between ${params.from}::date and ${params.to}::date)::int as joiners,
             count(*) filter (where e.date_of_exit between ${params.from}::date and ${params.to}::date)::int as leavers
      ${from} where e.deleted_at is null and ${employees} group by d.name order by 1`,
  },
];

export const reportByKey = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);
