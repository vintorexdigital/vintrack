import { sql } from 'drizzle-orm';
import type { Db } from '../database/db.service.js';
import { PURPOSE, type EnvelopeService } from './envelope.service.js';

/** Home location is kept sealed in employee_private. The columns on employees are legacy and are emptied by the seal-legacy-locations job. */
export async function readHome(db: Db, envelope: EnvelopeService, employeeId: string): Promise<{ lat: number; lng: number } | null> {
  const r = (await db.q.execute(sql`
    select p.home_sealed, e.home_latitude, e.home_longitude from employees e left join employee_private p on p.employee_id = e.id where e.id = ${employeeId}::uuid`)).rows[0] as { home_sealed: string | null; home_latitude: number | null; home_longitude: number | null } | undefined;
  if (!r) return null;
  if (r.home_sealed) return envelope.openPoint(PURPOSE.employeeHome, r.home_sealed);
  return r.home_latitude != null && r.home_longitude != null ? { lat: r.home_latitude, lng: r.home_longitude } : null;
}

export async function writeHome(db: Db, envelope: EnvelopeService, employeeId: string, p: { lat: number; lng: number } | null): Promise<void> {
  if (!p) { await db.q.execute(sql`delete from employee_private where employee_id = ${employeeId}::uuid`); return; }
  if (!envelope.enabled) {
    await db.q.execute(sql`update employees set home_latitude = ${p.lat}, home_longitude = ${p.lng} where id = ${employeeId}::uuid`);
    return;
  }
  const sealed = await envelope.sealPoint(PURPOSE.employeeHome, p);
  await db.q.execute(sql`
    insert into employee_private (tenant_id, employee_id, home_sealed) values (app_tenant_id(), ${employeeId}::uuid, ${sealed})
    on conflict (tenant_id, employee_id) do update set home_sealed = excluded.home_sealed, updated_at = now()`);
  await db.q.execute(sql`update employees set home_latitude = null, home_longitude = null where id = ${employeeId}::uuid and (home_latitude is not null or home_longitude is not null)`);
}
