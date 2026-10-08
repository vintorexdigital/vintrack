import { sql, type SQL } from 'drizzle-orm';
import { cleanTrack, trackDistanceMeters, type TrackPoint } from '@trackrex/rules';
import { PURPOSE } from '../../core/crypto/envelope.service.js';

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
  /** Most reports are one SQL query. */
  sql?(ctx: ReportContext): SQL;
  /** Reports over sealed data (location) cannot be computed inside the database; they read, open and compute in code. */
  load?(ctx: ReportContext, deps: ReportDeps): Promise<Record<string, string | number | null>[]>;
}

export interface ReportDeps {
  db: { q: { execute(q: SQL): Promise<{ rows: unknown[] }> } };
  envelope: { openPoint(purpose: string, sealed: string): Promise<{ lat: number; lng: number }> };
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
    key: 'lead-funnel', name: 'Lead funnel', category: 'Field', maxDays: 366,
    description: 'Leads created in the period by owner and stage, with expected value and how many were won.',
    columns: [...emp, { key: 'total', label: 'Leads', type: 'number', sum: true }, { key: 'open', label: 'Open', type: 'number', sum: true }, { key: 'won', label: 'Won', type: 'number', sum: true }, { key: 'lost', label: 'Lost', type: 'number', sum: true }, { key: 'wonValue', label: 'Won value', type: 'number', sum: true }, { key: 'conversion', label: 'Won of closed', type: 'percent' }],
    sql: ({ params, employees }) => sql`
      select ${who}, count(l.id)::int as total, count(*) filter (where l.stage not in ('won','lost'))::int as open, count(*) filter (where l.stage = 'won')::int as won,
             count(*) filter (where l.stage = 'lost')::int as lost, coalesce(sum(l.value) filter (where l.stage = 'won'), 0)::float as "wonValue",
             case when count(*) filter (where l.stage in ('won','lost')) = 0 then null else round(100.0 * count(*) filter (where l.stage = 'won') / count(*) filter (where l.stage in ('won','lost'))) end::float as conversion
      ${from} join leads l on l.owner_id = e.id and l.deleted_at is null and l.created_at::date between ${params.from}::date and ${params.to}::date
      where e.deleted_at is null and ${employees} group by e.id, d.name order by e.display_name`,
  },
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
    load: async ({ params, employees, timezone }, { db, envelope }) => {
      const people = (await db.q.execute(sql`select e.id, e.code, e.display_name, d.name as department ${from} where e.deleted_at is null and ${employees}`)).rows as { id: string; code: string | null; display_name: string; department: string | null }[];
      if (!people.length) return [];
      const pings = (await db.q.execute(sql`
        select employee_id, at, latitude, longitude, sealed, accuracy, speed from location_pings
         where mock = false and coalesce(accuracy, 0) <= 100 and at >= ${params.from}::date and at < (${params.to}::date + 1)
           and employee_id in (${sql.join(people.map((p) => sql`${p.id}::uuid`), sql`, `)})
         order by at limit 300000`)).rows as { employee_id: string; at: string; latitude: number | null; longitude: number | null; sealed: string | null; accuracy: number | null; speed: number | null }[];
      const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const hm = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
      const groups = new Map<string, { who: (typeof people)[number]; day: string; pts: TrackPoint[]; first: number; last: number }>();
      for (const r of pings) {
        const who = people.find((p) => p.id === r.employee_id)!;
        const at = new Date(r.at).getTime();
        const day = dayOf.format(at);
        const pos = r.sealed ? await envelope.openPoint(PURPOSE.locationPoint, r.sealed) : { lat: r.latitude!, lng: r.longitude! };
        const g = groups.get(`${r.employee_id}|${day}`) ?? { who, day, pts: [], first: at, last: at };
        g.pts.push({ at, lat: pos.lat, lng: pos.lng, accuracy: r.accuracy, speed: r.speed });
        g.last = at;
        groups.set(`${r.employee_id}|${day}`, g);
      }
      return [...groups.values()]
        .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.who.display_name.localeCompare(b.who.display_name)))
        .map((g) => ({ code: g.who.code, employee: g.who.display_name, department: g.who.department, day: g.day, km: Math.round(trackDistanceMeters(cleanTrack(g.pts)) / 10) / 100, points: g.pts.length, firstAt: hm.format(g.first), lastAt: hm.format(g.last) }));
    },
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
