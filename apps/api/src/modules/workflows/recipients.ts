import { sql } from 'drizzle-orm';
import type { Recipient } from '@trackrex/schemas';
import type { Db } from '../../core/database/db.service.js';

export interface EmployeeContext {
  id: string;
  name: string;
  code: string | null;
  status: string;
  departmentId: string | null;
  designationId: string | null;
  workLocationId: string | null;
  employeeTypeId: string | null;
  reportingManagerId: string | null;
}

export async function loadEmployee(db: Db, id: string | null | undefined): Promise<EmployeeContext | null> {
  if (!id) return null;
  const r = (await db.q.execute(sql`
    select id, display_name as name, code, status, department_id as "departmentId", designation_id as "designationId", work_location_id as "workLocationId",
           employee_type_id as "employeeTypeId", reporting_manager_id as "reportingManagerId" from employees where id = ${id}::uuid`)).rows[0];
  return (r as EmployeeContext | undefined) ?? null;
}

/** People with a sign-in who are linked to these employees. */
async function usersFor(db: Db, employeeIds: string[]): Promise<string[]> {
  if (!employeeIds.length) return [];
  const r = await db.q.execute(sql`select user_id from platform.memberships where tenant_id = app_tenant_id() and status = 'active' and employee_id = any(${sql.param(employeeIds)}::uuid[])`);
  return (r.rows as { user_id: string }[]).map((x) => x.user_id);
}

/** Works out who a workflow step is aimed at, from the person the event is about. Unknown or missing people give empty lists, never an error. */
export async function resolveRecipients(db: Db, r: Recipient, subject: EmployeeContext | null): Promise<{ userIds: string[]; employeeIds: string[] }> {
  let employeeIds: string[] = [];
  switch (r.kind) {
    case 'subject_employee': employeeIds = subject ? [subject.id] : []; break;
    case 'employee': employeeIds = [r.employeeId]; break;
    case 'manager': employeeIds = subject?.reportingManagerId ? [subject.reportingManagerId] : []; break;
    case 'manager_chain': {
      if (!subject) break;
      const rows = (await db.q.execute(sql`
        with recursive up as (
          select m.id, m.reporting_manager_id, 1 as depth from employees e join employees m on m.id = e.reporting_manager_id where e.id = ${subject.id}::uuid and m.deleted_at is null
          union all
          select m.id, m.reporting_manager_id, up.depth + 1 from up join employees m on m.id = up.reporting_manager_id where m.deleted_at is null and up.depth < 5
        ) select id from up where depth = ${r.level}`)).rows as { id: string }[];
      employeeIds = rows.map((x) => x.id);
      break;
    }
    case 'role': {
      const rows = (await db.q.execute(sql`select user_id, employee_id from platform.memberships where tenant_id = app_tenant_id() and status = 'active' and ${r.roleKey} = any(role_keys)`)).rows as { user_id: string; employee_id: string | null }[];
      return { userIds: rows.map((x) => x.user_id), employeeIds: rows.flatMap((x) => (x.employee_id ? [x.employee_id] : [])) };
    }
  }
  return { employeeIds, userIds: await usersFor(db, employeeIds) };
}
