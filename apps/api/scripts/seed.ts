/**
 * Seed script: platform staff, three demo companies on different plans, a company group, a user with two
 * memberships, and the demo tenant "Meridian Distributors (demo)" with 40 synthetic employees and 60 days of
 * attendance. Names and numbers come from an Indian-locale faker; no real people's data is used.
 * Safe to run twice: existing records are skipped.
 */
import 'reflect-metadata';
import { faker } from '@faker-js/faker/locale/en_IN';
import { NestFactory } from '@nestjs/core';
import { eq, sql } from 'drizzle-orm';
import { zonedToUtcMs, enumerateDates, addDays } from '@trackrex/rules';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/core/auth/password.js';
import { companyGroups, memberships, platformUsers, resellers, tenants, users } from '../src/core/auth/platform.tables.js';
import { Db } from '../src/core/database/db.service.js';
import { SequencesService } from '../src/core/sequences.service.js';
import { PlatformAuthService } from '../src/modules/platform/platform-auth.service.js';
import { ProvisioningService } from '../src/modules/accounts/provisioning.service.js';
import { AttendanceEngine } from '../src/modules/attendance/attendance-engine.service.js';
import { currentStore } from '../src/core/context.js';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Trackrex#2026';
const DEV_TOTP = process.env.SEED_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXP';
faker.seed(20260829);

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const db = app.get(Db);
const prov = app.get(ProvisioningService);
const platformAuth = app.get(PlatformAuthService);
const engine = app.get(AttendanceEngine);
const sequences = app.get(SequencesService);

async function staff(email: string, name: string, role: 'super_admin' | 'support' | 'finance' | 'onboarding' | 'analyst') {
  const [ex] = await db.platform.select().from(platformUsers).where(eq(platformUsers.email, email));
  if (ex) return ex;
  const u = await platformAuth.createStaff({ email, name, role, password: PASSWORD, totpSecret: DEV_TOTP });
  await db.platform.update(platformUsers).set({ totpEnabled: true }).where(eq(platformUsers.id, u.id));
  return u;
}

async function company(slug: string, name: string, owner: { name: string; email: string }, opts: { plan?: string; seats?: number; demo?: boolean; country?: string } = {}) {
  const [ex] = await db.app.select().from(tenants).where(eq(tenants.slug, slug));
  if (ex) return ex;
  const out = await prov.provision(
    { name, slug, country: opts.country ?? 'IN', timezone: 'Asia/Kolkata', currency: 'INR', locale: 'en-IN', planKey: opts.plan ?? 'trial', trialDays: 14, seatLimit: opts.seats ?? 25, isDemo: opts.demo ?? false, owner: { ...owner, password: PASSWORD } },
    { type: 'system' },
  );
  return out.tenant;
}

console.log('Seeding platform…');
const admin = await staff('admin@vintorex.test', 'Vintorex Admin', 'super_admin');
await staff('support@vintorex.test', 'Priya Support', 'support');
await staff('finance@vintorex.test', 'Farhan Finance', 'finance');
await staff('onboarding@vintorex.test', 'Olivia Onboarding', 'onboarding');
let [reseller] = await db.platform.select().from(resellers).where(eq(resellers.slug, 'coastal-partners'));
if (!reseller) [reseller] = await db.platform.insert(resellers).values({ name: 'Coastal Partners', slug: 'coastal-partners', contactEmail: 'hello@coastalpartners.test', marginPct: '15', brand: { primary: '#0F5E73' } }).returning();

const demo = await company('meridian-demo', 'Meridian Distributors (demo)', { name: 'Meena Raghavan', email: 'owner@meridian.test' }, { plan: 'all_in_one', seats: 60, demo: true });
const lakshmi = await company('lakshmi-textiles', 'Lakshmi Textiles', { name: 'Lakshmi Narayan', email: 'owner@lakshmi.test' }, { plan: 'trial', seats: 10 });
const coastal = await company('coastal-logistics', 'Coastal Logistics', { name: 'Chandra Pillai', email: 'owner@coastal.test' }, { plan: 'all_in_one', seats: 30 });
await db.platform.update(tenants).set({ status: 'past_due', pastDueSince: sql`now() - interval '6 days'`, resellerId: reseller!.id }).where(eq(tenants.id, coastal.id));
let [group] = await db.platform.select().from(companyGroups);
if (!group) [group] = await db.platform.insert(companyGroups).values({ name: 'Meridian Group' }).returning();
await db.platform.update(tenants).set({ groupId: group!.id }).where(eq(tenants.id, demo.id));
await db.platform.update(tenants).set({ groupId: group!.id }).where(eq(tenants.id, coastal.id));

// One consultant with a membership in two companies, to exercise the company switcher.
let [consultant] = await db.app.select().from(users).where(eq(users.email, 'consultant@trackrex.test'));
if (!consultant) {
  [consultant] = await db.app.insert(users).values({ email: 'consultant@trackrex.test', name: 'Kavya Consultant', passwordHash: await hashPassword(PASSWORD) }).returning();
  for (const t of [lakshmi, coastal]) await db.app.insert(memberships).values({ userId: consultant!.id, tenantId: t.id, roleKeys: ['admin'], status: 'active' });
}

/* ---------------------------------- demo tenant ---------------------------------- */

const alreadySeeded = await db.runAsTenant(demo.id, {}, async () => ((await db.q.execute(sql`select count(*)::int as n from employees`)).rows[0] as { n: number }).n);
if (alreadySeeded > 0) {
  console.log('Demo tenant already has employees; skipping.');
} else {
  console.log('Seeding Meridian Distributors (demo)…');
  const ownerRow = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!;
  await db.runAsTenant(demo.id, { userId: ownerRow.id }, async () => {
    const q = db.q;
    const uid = ownerRow.id;
    const locations = [
      { name: 'Chennai HQ', address: 'Guindy Industrial Estate, Chennai', lat: 13.0067, lng: 80.2206 },
      { name: 'Coimbatore Branch', address: 'Avinashi Road, Coimbatore', lat: 11.0183, lng: 76.9725 },
      { name: 'Madurai Branch', address: 'KK Nagar, Madurai', lat: 9.9252, lng: 78.1198 },
    ];
    const locIds: string[] = [];
    for (const l of locations) {
      const r = await q.execute(sql`insert into work_locations (tenant_id, name, address, latitude, longitude, radius_meters, created_by) values (app_tenant_id(), ${l.name}, ${l.address}, ${l.lat}, ${l.lng}, 250, ${uid}::uuid) returning id`);
      locIds.push((r.rows[0] as { id: string }).id);
    }
    const dept: Record<string, string> = {};
    for (const n of ['Sales', 'Operations', 'Finance', 'Human resources', 'Customer support']) {
      dept[n] = ((await q.execute(sql`insert into departments (tenant_id, name, created_by) values (app_tenant_id(), ${n}, ${uid}::uuid) returning id`)).rows[0] as { id: string }).id;
    }
    const desig: Record<string, string> = {};
    for (const [n, d] of [['Area manager', 'Sales'], ['Field executive', 'Sales'], ['Accounts executive', 'Finance'], ['HR executive', 'Human resources'], ['Support associate', 'Customer support'], ['Operations lead', 'Operations']] as const) {
      desig[n] = ((await q.execute(sql`insert into designations (tenant_id, name, department_id, created_by) values (app_tenant_id(), ${n}, ${dept[d]}::uuid, ${uid}::uuid) returning id`)).rows[0] as { id: string }).id;
    }
    // Shifts: reuse the seeded General shift as the Office shift, add the Field shift.
    const office = (await q.execute(sql`update shifts set name = 'Office', start_time = '10:00', max_punch_in_time = '10:15' where name = 'General shift' returning id`)).rows[0] as { id: string };
    const field = (await q.execute(sql`insert into shifts (tenant_id, name, timezone, start_time, max_punch_in_time, working_minutes, break_allowance_minutes, rules, created_by)
      values (app_tenant_id(), 'Field', 'Asia/Kolkata', '09:30', '09:45', 540, 60, '{"punch":{"selfie":"mandatory","location":"mandatory"}}'::jsonb, ${uid}::uuid) returning id`)).rows[0] as { id: string };
    const profile = (await q.execute(sql`select id from leave_profiles limit 1`)).rows[0] as { id: string };
    await q.execute(sql`insert into attendance_policies (tenant_id, name, start_date, description, rules, state, revision, created_by) values (app_tenant_id(), 'Standard policy', '2026-01-01', 'Late marks, minimum hours and missing punch-outs', ${JSON.stringify([
      { type: 'late_punch_in', graceMinutes: 15, afterMarks: 3, consequence: 'half_day' }, { type: 'min_hours', halfDayBelowMinutes: 300, absentBelowMinutes: 120 },
      { type: 'missing_punch_out', treatment: 'half_day' }, { type: 'overtime', thresholdMinutes: 30 },
    ])}::jsonb, 'published', 1, ${uid}::uuid)`);

    type Emp = { id: string; name: string; shift: string; email: string; managerId: string | null; join: string };
    const emps: Emp[] = [];
    const makeEmp = async (name: string, shiftId: string, managerId: string | null, department: string, designation: string, join: string, loc: string, email?: string): Promise<Emp> => {
      const code = await sequences.next('employees', 'EMP');
      const mail = email ?? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@meridian.test`;
      const mobile = `+9198${faker.string.numeric(8)}`;
      const [first, ...rest] = name.split(' ');
      const r = await q.execute(sql`
        insert into employees (tenant_id, code, first_name, last_name, display_name, gender, date_of_birth, work_email, mobile, date_of_joining, status, reporting_manager_id,
          department_id, designation_id, work_location_id, shift_id, leave_profile_id, created_by)
        values (app_tenant_id(), ${code}, ${first}, ${rest.join(' ') || null}, ${name}, ${faker.helpers.arrayElement(['female', 'male'])}, ${faker.date.birthdate({ min: 24, max: 50, mode: 'age' }).toISOString().slice(0, 10)}::date,
          ${mail}, ${mobile}, ${join}::date, 'active', ${managerId}::uuid, ${dept[department]}::uuid, ${desig[designation]}::uuid, ${loc}::uuid, ${shiftId}::uuid, ${profile.id}::uuid, ${uid}::uuid) returning id`);
      const id = (r.rows[0] as { id: string }).id;
      await q.execute(sql`insert into shift_assignments (tenant_id, employee_id, shift_id, effective_from, created_by) values (app_tenant_id(), ${id}::uuid, ${shiftId}::uuid, ${join}::date, ${uid}::uuid)`);
      const e = { id, name, shift: shiftId, email: mail, managerId, join };
      emps.push(e);
      return e;
    };

    const head = await makeEmp('Ramesh Iyer', office.id, null, 'Operations', 'Operations lead', '2021-04-05', locIds[0]!, 'head@meridian.test');
    const managers: Emp[] = [];
    const mgrNames = ['Anitha Krishnan', 'Suresh Babu', 'Divya Natarajan', 'Karthik Subramanian'];
    for (let i = 0; i < 4; i++) managers.push(await makeEmp(mgrNames[i]!, i < 2 ? field.id : office.id, head.id, i < 2 ? 'Sales' : 'Customer support', i < 2 ? 'Area manager' : 'Support associate', '2022-06-15', locIds[i % 3]!, i === 0 ? 'manager@meridian.test' : undefined));
    const deptCycle = [['Sales', 'Field executive'], ['Sales', 'Field executive'], ['Finance', 'Accounts executive'], ['Customer support', 'Support associate'], ['Human resources', 'HR executive']] as const;
    for (let i = 0; i < 35; i++) {
      const m = managers[i % 4]!;
      const [d, g] = deptCycle[i % 5]!;
      const isField = d === 'Sales';
      const email = i === 0 ? 'employee@meridian.test' : i === 4 ? 'hr@meridian.test' : undefined;
      await makeEmp(`${faker.person.firstName()} ${faker.person.lastName()}`, isField ? field.id : office.id, m.id, d, g, faker.date.between({ from: '2022-08-01', to: '2025-12-01' }).toISOString().slice(0, 10), locIds[i % 3]!, email);
    }
    await q.execute(sql`update employees set status = 'active'`);

    // Login users for the demo: HR admin, manager and employee, each linked to an employee record.
    const pw = await hashPassword(PASSWORD);
    const logins: [string, string[], string][] = [['hr@meridian.test', ['hr_admin'], 'HR Admin'], ['manager@meridian.test', ['manager'], 'Anitha Krishnan'], ['employee@meridian.test', ['employee'], 'Employee'], ['head@meridian.test', ['manager', 'functional_manager'], 'Ramesh Iyer']];
    for (const [email, roles] of logins) {
      const emp = emps.find((e) => e.email === email)!;
      const [u] = await db.app.insert(users).values({ email, name: emp.name, passwordHash: pw, emailVerifiedAt: sql`now()` }).returning();
      await db.app.insert(memberships).values({ userId: u!.id, tenantId: demo.id, roleKeys: roles, status: 'active', employeeId: emp.id });
    }
    await db.app.execute(sql`update platform.tenant_usage set employees_active = ${emps.length}, updated_at = now() where tenant_id = ${demo.id}::uuid`);

    // 60 days of punches, then let the engine derive each day.
    const today = new Date().toISOString().slice(0, 10);
    const days = enumerateDates(addDays(today, -60), addDays(today, -1)).filter((d) => new Date(d).getUTCDay() !== 0);
    const rows: string[] = [];
    const startOf = (shift: string) => (shift === field.id ? '09:30' : '10:00');
    const jitter = (min: number, max: number) => faker.number.int({ min, max });
    const toTs = (d: string, hhmm: string, plusMin: number) => new Date(zonedToUtcMs(d, hhmm, 'Asia/Kolkata') + plusMin * 60_000).toISOString();
    const leaveDays = new Map<string, Set<string>>();
    for (const e of emps) {
      const off = new Set<string>();
      for (const d of days) if (faker.number.int({ min: 1, max: 100 }) <= 6) off.add(d);
      leaveDays.set(e.id, off);
      for (const d of days) {
        if (d < e.join || off.has(d)) continue;
        const start = startOf(e.shift);
        const late = faker.number.int({ min: 1, max: 100 }) <= 14 ? jitter(16, 55) : jitter(-12, 12);
        const inAt = toTs(d, start, late);
        const outAt = toTs(d, start, 540 + jitter(-25, 40));
        const field_ = e.shift === field.id;
        const lat = field_ ? 13.0 + Math.random() * 0.06 : 13.0067, lng = field_ ? 80.2 + Math.random() * 0.06 : 80.2206;
        rows.push(`(app_tenant_id(), '${e.id}', 'in', '${inAt}', '${d}', '${field_ ? 'mobile' : 'desktop'}', '${e.shift}', ${lat}, ${lng})`);
        rows.push(`(app_tenant_id(), '${e.id}', 'out', '${outAt}', '${d}', '${field_ ? 'mobile' : 'desktop'}', '${e.shift}', ${lat}, ${lng})`);
      }
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await q.execute(sql.raw(`insert into punches (tenant_id, employee_id, type, at, attendance_date, source, shift_id, latitude, longitude) values ${rows.slice(i, i + 1000).join(',')}`));
    }
    // Approved leave on the "off" days for a third of them, the rest stay absent.
    const casual = (await q.execute(sql`select id from leave_types where code = 'CL'`)).rows[0] as { id: string };
    let n = 0;
    for (const e of emps) {
      for (const d of leaveDays.get(e.id)!) {
        if (d < e.join || n++ % 3 !== 0) continue;
        const code = await sequences.next('leave-requests', 'LV');
        const r = await q.execute(sql`insert into leave_requests (tenant_id, code, employee_id, leave_type_id, duration, from_date, to_date, days, reason, status, action_by, action_at, created_by)
          values (app_tenant_id(), ${code}, ${e.id}::uuid, ${casual.id}::uuid, 'full', ${d}::date, ${d}::date, 1, 'Personal work', 'approved', ${e.managerId}::uuid, now(), ${uid}::uuid) returning id`);
        await q.execute(sql`insert into leave_ledger (tenant_id, employee_id, leave_type_id, session_start, date, days, kind, request_id) values (app_tenant_id(), ${e.id}::uuid, ${casual.id}::uuid, ${`${new Date(d).getUTCFullYear()}-01-01`}::date, ${d}::date, 1, 'taken', ${(r.rows[0] as { id: string }).id}::uuid)`);
      }
    }
    // A few pending requests so the approval queues are not empty.
    for (const e of emps.slice(6, 12)) {
      const from = addDays(today, 5 + (n++ % 7));
      if (new Date(from).getUTCDay() === 0) continue;
      const code = await sequences.next('leave-requests', 'LV');
      await q.execute(sql`insert into leave_requests (tenant_id, code, employee_id, leave_type_id, duration, from_date, to_date, days, reason, status, created_by) values (app_tenant_id(), ${code}, ${e.id}::uuid, ${casual.id}::uuid, 'full', ${from}::date, ${from}::date, 1, 'Family event', 'pending', ${uid}::uuid)`);
    }
    for (const e of emps.slice(12, 15)) {
      const d = days[days.length - 2]!;
      await q.execute(sql`insert into regularizations (tenant_id, employee_id, date, current_code, requested_code, reason, status, created_by) values (app_tenant_id(), ${e.id}::uuid, ${d}::date, 'AB', 'P', 'Forgot to punch, was on a client visit', 'pending', ${uid}::uuid)`);
    }
    let derived = 0;
    for (const e of emps) derived += await engine.recomputeRange(e.id, days[0]! > e.join ? days[0]! : e.join, today);
    await q.execute(sql`insert into feed_events (tenant_id, at, type, employee_id, platform, entity, entity_id, meta) select tenant_id, at, 'punch.' || type, employee_id, case source when 'mobile' then 'android' else 'desktop' end, 'punch', id::text, '{}'::jsonb from punches where at > now() - interval '3 days' limit 300`);
    console.log(`  ${emps.length} employees, ${rows.length} punches, ${derived} attendance days (store ${currentStore().tenantId})`);
  });
}

await app.close();
console.log('\nSeed complete. Sign-in details (all passwords: ' + PASSWORD + '):');
console.log('  Platform console  admin@vintorex.test     (2FA secret ' + DEV_TOTP + ')');
console.log('  Demo company      owner@meridian.test     tenant: meridian-demo');
console.log('  HR admin          hr@meridian.test        manager: manager@meridian.test    employee: employee@meridian.test');
console.log('  Two companies     consultant@trackrex.test (lakshmi-textiles, coastal-logistics)');
void admin;
