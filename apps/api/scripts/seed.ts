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
import { EnvelopeService } from '../src/core/crypto/envelope.service.js';
import { STORAGE, type StorageProvider } from '../src/modules/files/storage.js';
import { syntheticWav } from '../src/shared/providers/telephony/telephony.provider.js';
import { TrackingService } from '../src/modules/field/tracking.service.js';
import { RbacService } from '../src/core/rbac.service.js';
import { OnboardingService } from '../src/modules/onboarding/onboarding.module.js';
import { PayrollService } from '../src/modules/payroll/payroll.module.js';
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

async function company(slug: string, name: string, owner: { name: string; email: string }, opts: { plan?: string; seats?: number; demo?: boolean; country?: string; password?: string } = {}) {
  const [ex] = await db.app.select().from(tenants).where(eq(tenants.slug, slug));
  if (ex) return ex;
  const out = await prov.provision(
    { name, slug, country: opts.country ?? 'IN', timezone: 'Asia/Kolkata', currency: 'INR', locale: 'en-IN', planKey: opts.plan ?? 'trial', trialDays: 14, seatLimit: opts.seats ?? 25, isDemo: opts.demo ?? false, owner: { ...owner, password: opts.password ?? PASSWORD } },
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
// Optional personal workspace: SEED_ADMIN_TENANT, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD keep the credentials out of the repo.
if (process.env.SEED_ADMIN_TENANT && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
  await company(process.env.SEED_ADMIN_TENANT, 'Trackerex Demo', { name: 'Admin', email: process.env.SEED_ADMIN_EMAIL }, { plan: 'all_in_one', seats: 60, password: process.env.SEED_ADMIN_PASSWORD });
}
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

/* ------------------------- demo field data (customers, tasks, live map) ------------------------- */

await db.runAsTenant(demo.id, { userId: (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id }, async () => {
  const q = db.q;
  const have = ((await q.execute(sql`select count(*)::int as n from customers`)).rows[0] as { n: number }).n;
  const fieldEmps = (await q.execute(sql`select e.id, e.display_name, e.reporting_manager_id from employees e join shifts s on s.id = e.shift_id where s.name = 'Field' and e.status = 'active' order by e.code limit 10`)).rows as { id: string; display_name: string; reporting_manager_id: string | null }[];
  if (have > 0 || !fieldEmps.length) return;
  console.log('Seeding demo customers, tasks and live positions…');
  const uid = currentStore().auth?.userId ?? null;
  const spots: [string, string, number, number][] = [
    ['Anand Stores', 'T. Nagar', 13.0418, 80.2341], ['Kumaran Traders', 'Mylapore', 13.0339, 80.2619], ['Sri Lakshmi Agencies', 'Adyar', 13.0012, 80.2565], ['Raj Electricals', 'Anna Nagar', 13.085, 80.2101],
    ['Murugan Distributors', 'Velachery', 12.9815, 80.218], ['Fresh Basket', 'Besant Nagar', 13.0002, 80.2668], ['Chennai Pharma Hub', 'Egmore', 13.0732, 80.2609], ['Ganesh Hardware', 'Perambur', 13.1186, 80.2336],
    ['Sunrise Supermart', 'Porur', 13.0382, 80.157], ['Metro Wholesale', 'Guindy', 13.0067, 80.2206],
  ];
  const custIds: string[] = [];
  for (const [name, city, lat, lng] of spots) {
    const code = await sequences.next('customers', 'CUST');
    const r = await q.execute(sql`insert into customers (tenant_id, code, name, customer_type, phone, address, city, latitude, longitude, account_owner_id, status, created_by)
      values (app_tenant_id(), ${code}, ${name}, 'retailer', ${`+9198${faker.string.numeric(8)}`}, ${`${city}, Chennai`}, 'Chennai', ${lat}, ${lng}, ${fieldEmps[custIds.length % fieldEmps.length]!.id}::uuid, 'active', ${uid}::uuid) returning id`);
    const id = (r.rows[0] as { id: string }).id;
    custIds.push(id);
    await q.execute(sql`insert into contacts (tenant_id, customer_id, name, designation, phone, is_primary, created_by) values (app_tenant_id(), ${id}::uuid, ${faker.person.fullName()}, 'Owner', ${`+9197${faker.string.numeric(8)}`}, true, ${uid}::uuid)`);
  }
  const titles = ['Collect payment', 'Stock check and reorder', 'Deliver samples', 'Launch new scheme', 'Resolve complaint', 'Monthly review visit'];
  const now = Date.now();
  let t = 0;
  for (const e of fieldEmps) {
    for (let k = 0; k < 3; k++) {
      const c = custIds[(t + k) % custIds.length]!;
      const spot = spots[(t + k) % spots.length]!;
      const code = await sequences.next('tasks', 'TSK');
      const state = k === 0 ? 'completed' : k === 1 ? 'in_progress' : 'open';
      const due = new Date(now + (k - 1) * 3 * 3_600_000).toISOString();
      await q.execute(sql`insert into tasks (tenant_id, code, title, task_type, customer_id, assignee_id, due_at, priority, status, started_at, completed_at, check_in_latitude, check_in_longitude, check_in_distance_m, outcome, created_by)
        values (app_tenant_id(), ${code}, ${titles[(t + k) % titles.length]}, 'visit', ${c}::uuid, ${e.id}::uuid, ${due}::timestamptz, ${k === 2 ? 'high' : 'normal'}, ${state},
          ${state === 'open' ? null : new Date(now - 5 * 3_600_000).toISOString()}::timestamptz, ${state === 'completed' ? new Date(now - 4 * 3_600_000).toISOString() : null}::timestamptz,
          ${state === 'open' ? null : spot[2]}, ${state === 'open' ? null : spot[3]}, ${state === 'open' ? null : faker.number.int({ min: 8, max: 90 })}, ${state === 'completed' ? 'Visit done, order noted.' : null}, ${uid}::uuid)`);
    }
    t++;
  }
  // Today's working positions: punched in a few hours ago, a random walk across Chennai every 5 minutes.
  const today = new Date().toISOString().slice(0, 10);
  const shiftId = (await q.execute(sql`select id from shifts where name = 'Field'`)).rows[0] as { id: string };
  for (const e of fieldEmps.slice(0, 8)) {
    const startMs = now - 3 * 3_600_000;
    await q.execute(sql`insert into punches (tenant_id, employee_id, type, at, attendance_date, source, shift_id, latitude, longitude) select app_tenant_id(), ${e.id}::uuid, 'in', ${new Date(startMs).toISOString()}::timestamptz, ${today}::date, 'mobile', ${shiftId.id}::uuid, 13.0067, 80.2206 where not exists (select 1 from punches where employee_id = ${e.id}::uuid and attendance_date = ${today}::date)`);
    let lat = 13.0067, lng = 80.2206;
    const pts: string[] = [];
    for (let ms = startMs; ms <= now; ms += 5 * 60_000) {
      lat += (Math.random() - 0.45) * 0.004; lng += (Math.random() - 0.45) * 0.004;
      pts.push(`(app_tenant_id(), '${e.id}', '${new Date(ms).toISOString()}', ${lat}, ${lng}, ${5 + Math.round(Math.random() * 15)}, ${Math.round(Math.random() * 6 * 10) / 10}, ${40 + Math.round(Math.random() * 55)}, 'gps')`);
    }
    await q.execute(sql.raw(`insert into location_pings (tenant_id, employee_id, at, latitude, longitude, accuracy, speed, battery, provider) values ${pts.join(',')}`));
    await q.execute(sql`insert into live_locations (tenant_id, employee_id, at, latitude, longitude, accuracy, battery, moving) values (app_tenant_id(), ${e.id}::uuid, ${new Date(now).toISOString()}::timestamptz, ${lat}, ${lng}, 8, 70, true)
      on conflict (tenant_id, employee_id) do update set at = excluded.at, latitude = excluded.latitude, longitude = excluded.longitude`);
  }
  // The seed writes plain coordinates for speed; sealing them the way the worker does keeps the demo like production.
  await app.get(TrackingService).sealLegacy(100_000);

  // A visit checklist, attached to this company's visit tasks; the completed ones have it filled in (mock answers).
  const questions = [
    { id: 'shelf_stocked', label: 'Is the shelf fully stocked?', type: 'yes_no', required: true },
    { id: 'gap', label: 'What is missing?', type: 'textarea', required: true, showIf: { questionId: 'shelf_stocked', equals: false } },
    { id: 'facings', label: 'Number of facings', type: 'number', min: 0, max: 200 },
    { id: 'mood', label: 'How was the owner\'s mood?', type: 'rating' },
    { id: 'next_step', label: 'Next step', type: 'select', required: true, options: [{ value: 'reorder', label: 'Reorder' }, { value: 'follow_up', label: 'Follow up later' }, { value: 'none', label: 'Nothing needed' }] },
  ];
  await q.execute(sql`insert into form_templates (tenant_id, name, description, status, task_types, required_to_complete, questions)
    select app_tenant_id(), 'Store visit checklist', 'Shelf check and next step for a customer visit.', 'active', ${sql.param(['visit'])}::text[], true, ${JSON.stringify(questions)}::jsonb
    where not exists (select 1 from form_templates where name = 'Store visit checklist')`);
  await q.execute(sql`insert into task_forms (tenant_id, task_id, template_id, template_name, questions, required_to_complete, answers, status, submitted_at)
    select app_tenant_id(), t.id, f.id, f.name, f.questions, true,
           case when t.status = 'completed' then '{"shelf_stocked": false, "gap": "Out of 200 g packs", "facings": 6, "mood": 4, "next_step": "reorder"}'::jsonb else '{}'::jsonb end,
           case when t.status = 'completed' then 'submitted' else 'draft' end, case when t.status = 'completed' then t.completed_at else null end
      from tasks t, form_templates f where f.name = 'Store visit checklist' and t.task_type = 'visit' and t.deleted_at is null
    on conflict (tenant_id, task_id) do nothing`);
});

/* ------------------------------ demo workflows ------------------------------ */

await db.runAsTenant(demo.id, {}, async () => {
  const q = db.q;
  const steps = (v: unknown) => JSON.stringify(v);
  await q.execute(sql`insert into workflows (tenant_id, name, description, status, trigger, conditions, steps)
    select app_tenant_id(), 'Large expense review', 'Claims of 50,000 or more are flagged to the manager and wait for a second pair of eyes.', 'active', 'expense.submitted',
           ${steps([{ path: 'payload.amount', op: 'gte', value: 50000 }])}::jsonb,
           ${steps([{ type: 'notify', to: { kind: 'manager' }, title: '{{employee.name}} submitted a large claim', body: '{{payload.currency}} {{payload.amount}}' }, { type: 'approval', approver: { kind: 'manager_chain', level: 2 }, title: 'Second review: {{employee.name}} claimed {{payload.amount}}' }])}::jsonb
    where not exists (select 1 from workflows where name = 'Large expense review')`);
  await q.execute(sql`insert into workflows (tenant_id, name, description, status, trigger, conditions, steps)
    select app_tenant_id(), 'Welcome task for new leads', 'Gives the owner a follow-up task a day after a lead is assigned.', 'paused', 'lead.assigned', '[]'::jsonb,
           ${steps([{ type: 'delay', minutes: 1440 }, { type: 'create_task', assignTo: { kind: 'subject_employee' }, title: 'Follow up: {{payload.title}}', dueInHours: 24, priority: 'normal' }])}::jsonb
    where not exists (select 1 from workflows where name = 'Welcome task for new leads')`);
});

/* ------------------------------ demo saved reports and dashboard ------------------------------ */

await db.runAsTenant(demo.id, {}, async () => {
  const q = db.q;
  const uid = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id;
  const reports: [string, string, object][] = [
    ['Hours worked by department', 'Total hours and late marks per department over the last 30 days.', { dataset: 'attendance', dimensions: ['department'], measures: ['worked_hours', 'late_marks'], filters: [], range: { mode: 'last_days', days: 30 }, limit: 50, chart: 'bar' }],
    ['Attendance trend', 'Present days per month.', { dataset: 'attendance', dimensions: ['month'], measures: ['present_days', 'absent_days'], filters: [], range: { mode: 'last_days', days: 90 }, limit: 24, chart: 'line' }],
    ['Expenses by category', 'Where the money goes this month.', { dataset: 'expenses', dimensions: ['category'], measures: ['claimed', 'approved'], filters: [], range: { mode: 'this_month' }, limit: 20, chart: 'pie' }],
    ['Lead pipeline', 'Expected value by stage.', { dataset: 'leads', dimensions: ['stage'], measures: ['leads', 'value'], filters: [], range: { mode: 'last_days', days: 90 }, limit: 10, chart: 'bar' }],
    ['Task completion', 'How the field team is doing on tasks this month.', { dataset: 'tasks', dimensions: [], measures: ['tasks', 'completed', 'completion_rate'], filters: [], range: { mode: 'this_month' }, limit: 1, chart: 'table' }],
  ];
  const ids: string[] = [];
  for (const [name, description, definition] of reports) {
    const ex = (await q.execute(sql`select id from saved_reports where name = ${name} and deleted_at is null`)).rows[0] as { id: string } | undefined;
    if (ex) { ids.push(ex.id); continue; }
    const r = (await q.execute(sql`insert into saved_reports (tenant_id, name, description, visibility, definition, created_by) values (app_tenant_id(), ${name}, ${description}, 'company', ${JSON.stringify(definition)}::jsonb, ${uid}::uuid) returning id`)).rows[0] as { id: string };
    ids.push(r.id);
  }
  const widgets = [
    { id: 'w1', title: 'Task completion', reportId: ids[4], display: 'kpi', size: 'md' },
    { id: 'w2', title: 'Pipeline value by stage', reportId: ids[3], display: 'bar', size: 'md' },
    { id: 'w3', title: 'Hours by department', reportId: ids[0], display: 'bar', size: 'md' },
    { id: 'w4', title: 'Expenses this month', reportId: ids[2], display: 'pie', size: 'md' },
    { id: 'w5', title: 'Attendance trend', reportId: ids[1], display: 'line', size: 'lg' },
  ];
  await q.execute(sql`insert into dashboards (tenant_id, name, description, visibility, widgets, created_by)
    select app_tenant_id(), 'Operations overview', 'The numbers a day usually starts with.', 'company', ${JSON.stringify(widgets)}::jsonb, ${uid}::uuid
    where not exists (select 1 from dashboards where name = 'Operations overview' and deleted_at is null)`);
});

/* ------------------------------ demo HR suite and help desk (mock data) ------------------------------ */

await db.runAsTenant(demo.id, {}, async () => {
  console.log('Seeding demo payroll, onboarding, help desk and assets…');
  const q = db.q;
  const uid = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id;
  const emps = (await q.execute(sql`select id, display_name from employees where deleted_at is null and status = 'active' order by code`)).rows as { id: string; display_name: string }[];

  // Salary structures: invented numbers, in a plausible spread.
  for (const [i, e] of emps.entries()) {
    const basic = 15000 + ((i * 7919) % 14) * 3500;
    await q.execute(sql`insert into salary_structures (tenant_id, employee_id, effective_from, basic, hra, special_allowance, other_allowance, pf_enabled, esi_enabled, professional_tax, other_deductions, created_by)
      select app_tenant_id(), ${e.id}::uuid, '2025-04-01', ${basic}, ${Math.round(basic * 0.4)}, ${Math.round(basic * 0.5)}, ${i % 5 === 0 ? 1500 : 0}, true, ${basic < 12000}, ${basic > 21000 ? 200 : 0}, ${i % 9 === 0 ? 1000 : 0}, ${uid}::uuid
      where not exists (select 1 from salary_structures where employee_id = ${e.id}::uuid)`);
  }
  // Last month's payroll: drafted, finalized and paid through the real service, so the numbers come from the real attendance data.
  const already = (await q.execute(sql`select 1 from payroll_runs limit 1`)).rows.length > 0;
  if (!already) {
    const rbac = app.get(RbacService);
    currentStore().auth = { realm: 'company', userId: uid, tenantId: demo.id, employeeId: null, roleKeys: ['owner'], isOwner: true, permissions: await rbac.resolve(demo.id, ['owner'], false) };
    const payroll = app.get(PayrollService);
    const now = new Date();
    const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
    try {
      const run = (await payroll.create({ date: lastMonthEnd })).run;
      await payroll.finalize(run.id);
      await payroll.pay(run.id, { reference: 'DEMO-NEFT-0001 (mock)' });
    } catch (e) { console.warn('  payroll demo skipped:', (e as Error).message); }
    delete currentStore().auth;
  }

  // A joining checklist and one case.
  const items = [
    { title: 'Sign the offer letter and policies', who: 'employee', dueDays: 1 }, { title: 'Collect ID and bank details', who: 'hr', dueDays: 2 },
    { title: 'Create email and accounts', who: 'it', dueDays: 1 }, { title: 'Hand over a laptop', who: 'it', dueDays: 1 }, { title: 'Introduce the team and set first-week goals', who: 'manager', dueDays: 3 },
  ];
  await q.execute(sql`insert into onboarding_templates (tenant_id, name, kind, status, items, created_by) select app_tenant_id(), 'New joiner checklist', 'joining', 'active', ${JSON.stringify(items)}::jsonb, ${uid}::uuid where not exists (select 1 from onboarding_templates where name = 'New joiner checklist')`);
  await q.execute(sql`insert into onboarding_templates (tenant_id, name, kind, status, items, created_by) select app_tenant_id(), 'Exit checklist', 'exit', 'active', ${JSON.stringify([{ title: 'Collect laptop and ID card', who: 'it', dueDays: 0 }, { title: 'Revoke accounts', who: 'it', dueDays: 0 }, { title: 'Exit interview', who: 'hr', dueDays: 3 }, { title: 'Final settlement', who: 'hr', dueDays: 7 }])}::jsonb, ${uid}::uuid where not exists (select 1 from onboarding_templates where name = 'Exit checklist')`);
  const joiner = emps[emps.length - 1]!;
  const tpl = (await q.execute(sql`select id from onboarding_templates where name = 'New joiner checklist'`)).rows[0] as { id: string };
  if (!(await q.execute(sql`select 1 from onboarding_cases where employee_id = ${joiner.id}::uuid`)).rows.length) {
    await app.get(OnboardingService).start(joiner.id, tpl.id, new Date().toISOString().slice(0, 10), uid);
  }

  // Assets, some assigned.
  if (!(await q.execute(sql`select 1 from assets limit 1`)).rows.length) {
    const kinds: [string, string][] = [['ThinkPad T14', 'laptop'], ['Dell Latitude 5440', 'laptop'], ['Redmi Note 13', 'phone'], ['Samsung Galaxy A35', 'phone'], ['Hero Splendor', 'vehicle'], ['Visitor ID card', 'id_card']];
    for (let i = 0; i < 18; i++) {
      const [name, category] = kinds[i % kinds.length]!;
      const code = await sequences.next('assets', 'AST');
      const holder = i < 12 ? emps[i % emps.length]!.id : null;
      const a = (await q.execute(sql`insert into assets (tenant_id, code, name, category, serial, purchase_date, cost, status, assigned_to_id, created_by)
        values (app_tenant_id(), ${code}, ${name}, ${category}, ${`SN-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`}, ${new Date(Date.now() - (i + 2) * 40 * 86_400_000).toISOString().slice(0, 10)}::date,
                ${category === 'laptop' ? 62000 : category === 'phone' ? 18000 : 4000}, ${holder ? 'assigned' : i === 17 ? 'repair' : 'in_stock'}, ${holder}::uuid, ${uid}::uuid) returning id`)).rows[0] as { id: string };
      if (holder) await q.execute(sql`insert into asset_assignments (tenant_id, asset_id, employee_id, assigned_by, assign_note) values (app_tenant_id(), ${a.id}::uuid, ${holder}::uuid, ${uid}::uuid, 'Issued at joining')`);
    }
  }

  // Tickets in every state, with a little conversation.
  if (!(await q.execute(sql`select 1 from tickets limit 1`)).rows.length) {
    const subjects: [string, string, string, string][] = [
      ['Laptop battery drains in an hour', 'it', 'high', 'in_progress'], ['Need a new ID card', 'admin', 'normal', 'open'], ['Salary slip shows wrong PT', 'hr', 'high', 'waiting'], ['VPN will not connect from home', 'it', 'urgent', 'open'],
      ['AC is not working near desk 14', 'facilities', 'low', 'resolved'], ['Reimbursement not credited', 'finance', 'normal', 'in_progress'], ['Request for second monitor', 'it', 'low', 'closed'], ['Update my bank account details', 'hr', 'normal', 'resolved'],
      ['Parking sticker for the new bike', 'admin', 'low', 'open'], ['Cannot print from the third floor', 'it', 'normal', 'resolved'],
    ];
    for (const [i, [subject, category, priority, status]] of subjects.entries()) {
      const code = await sequences.next('tickets', 'HD');
      const requester = emps[(i * 3 + 1) % emps.length]!;
      const created = Date.now() - (i + 1) * 9 * 3_600_000;
      const responded = status === 'open' ? null : created + 2 * 3_600_000;
      const t = (await q.execute(sql`insert into tickets (tenant_id, code, subject, description, requester_id, category, priority, status, assignee_id, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, rating, created_at, created_by)
        values (app_tenant_id(), ${code}, ${subject}, ${'Raised from the demo data.'}, ${requester.id}::uuid, ${category}, ${priority}, ${status}, ${status === 'open' ? null : emps[0]!.id}::uuid,
                ${new Date(created + 4 * 3_600_000).toISOString()}::timestamptz, ${new Date(created + (priority === 'urgent' ? 4 : priority === 'high' ? 24 : 72) * 3_600_000).toISOString()}::timestamptz,
                ${responded ? new Date(responded).toISOString() : null}::timestamptz, ${status === 'resolved' || status === 'closed' ? new Date(created + 5 * 3_600_000).toISOString() : null}::timestamptz,
                ${status === 'closed' ? 5 : null}, ${new Date(created).toISOString()}::timestamptz, ${uid}::uuid) returning id`)).rows[0] as { id: string };
      if (responded) {
        await q.execute(sql`insert into ticket_comments (tenant_id, ticket_id, author_user_id, author_employee_id, body, internal, created_at) values (app_tenant_id(), ${t.id}::uuid, ${uid}::uuid, ${emps[0]!.id}::uuid, 'Looking into this now.', false, ${new Date(responded).toISOString()}::timestamptz)`);
        await q.execute(sql`insert into ticket_comments (tenant_id, ticket_id, author_user_id, author_employee_id, body, internal, created_at) values (app_tenant_id(), ${t.id}::uuid, ${uid}::uuid, ${emps[0]!.id}::uuid, 'Checked the logs; nothing unusual on our side.', true, ${new Date(responded + 600_000).toISOString()}::timestamptz)`);
      }
    }
  }
});

/* ------------------------------ demo expenses ------------------------------ */

await db.runAsTenant(demo.id, { userId: (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id }, async () => {
  const q = db.q;
  const ownerId = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id;
  if (((await q.execute(sql`select count(*)::int as n from expense_categories`)).rows[0] as { n: number }).n === 0) {
    const { seedExpenseDefaults } = await import('../src/modules/expenses/expenses.seed.js');
    await seedExpenseDefaults(db, { tenantId: demo.id, ownerUserId: ownerId } as never);
  }
  if (((await q.execute(sql`select count(*)::int as n from expenses`)).rows[0] as { n: number }).n > 0) return;
  console.log('Seeding demo expense claims…');
  const cats = (await q.execute(sql`select id, name from expense_categories`)).rows as { id: string; name: string }[];
  const emps = (await q.execute(sql`select e.id, e.reporting_manager_id from employees e join shifts s on s.id = e.shift_id where s.name = 'Field' and e.status = 'active' order by e.code limit 8`)).rows as { id: string; reporting_manager_id: string | null }[];
  const today = new Date();
  let i = 0;
  for (const e of emps) {
    for (let k = 0; k < 3; k++, i++) {
      const cat = cats[i % 4]!;
      const status = k === 0 ? 'paid' : k === 1 ? 'approved' : 'pending';
      const amount = 150 + ((i * 97) % 900);
      const day = new Date(today.getTime() - (k * 6 + 2) * 86_400_000).toISOString().slice(0, 10);
      const code = await sequences.next('expenses', 'EXP');
      await q.execute(sql`insert into expenses (tenant_id, code, employee_id, category_id, expense_date, amount, currency, merchant, status, approved_amount, action_by, action_at, paid_at, payment_reference, created_by)
        values (app_tenant_id(), ${code}, ${e.id}::uuid, ${cat.id}::uuid, ${day}::date, ${amount}, 'INR', ${['Metro', 'HP Petrol Pump', 'Saravana Bhavan', 'Ola'][i % 4]}, ${status},
          ${status === 'pending' ? null : amount}, ${status === 'pending' ? null : e.reporting_manager_id}::uuid, ${status === 'pending' ? null : new Date(today.getTime() - k * 86_400_000).toISOString()}::timestamptz,
          ${status === 'paid' ? new Date().toISOString() : null}::timestamptz, ${status === 'paid' ? `NEFT-${1000 + i}` : null}, ${ownerId}::uuid)`);
    }
  }
});

/* ------------------------- demo desktop activity ------------------------- */

await db.runAsTenant(demo.id, { userId: (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id }, async () => {
  const q = db.q;
  const ownerId = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id;
  if (((await q.execute(sql`select count(*)::int as n from app_classes`)).rows[0] as { n: number }).n === 0) {
    const { seedProductivityDefaults } = await import('../src/modules/productivity/productivity.seed.js');
    await seedProductivityDefaults(db, { tenantId: demo.id, ownerUserId: ownerId } as never);
  }
  if (((await q.execute(sql`select count(*)::int as n from activity_buckets`)).rows[0] as { n: number }).n > 0) return;
  console.log('Seeding demo desktop activity…');
  const emps = (await q.execute(sql`select e.id from employees e join shifts s on s.id = e.shift_id where s.name = 'Office' and e.status = 'active' order by e.code limit 12`)).rows as { id: string }[];
  const apps: [string, string | null, number][] = [['excel', null, 5], ['outlook', null, 3], ['code', null, 3], ['chrome', 'docs.google.com', 2], ['chrome', 'youtube.com', 1], ['chrome', 'news.example.com', 1], ['chrome', 'facebook.com', 1]];
  const pool = apps.flatMap((a) => Array.from({ length: a[2] }, () => a));
  const rows: string[] = [];
  const tz = 'Asia/Kolkata';
  for (let back = 1; back <= 7; back++) {
    const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    if (new Date(d).getUTCDay() === 0) continue;
    for (const e of emps) {
      const start = zonedToUtcMs(d, '10:05', tz);
      const minutes = faker.number.int({ min: 300, max: 480 });
      for (let i = 0; i < minutes; i++) {
        if (i % 60 > 52) continue; // short breaks
        const [app, domain] = pool[(i * 7 + faker.number.int({ min: 0, max: 40 })) % pool.length]!;
        const idle = faker.number.int({ min: 0, max: 100 }) < 12 ? faker.number.int({ min: 20, max: 60 }) : faker.number.int({ min: 0, max: 8 });
        rows.push(`(app_tenant_id(), '${e.id}', '${new Date(start + i * 60_000).toISOString()}', 60, ${60 - idle}, ${idle}, '${app}', ${domain ? `'${domain}'` : 'null'})`);
      }
    }
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await q.execute(sql.raw(`insert into activity_buckets (tenant_id, employee_id, start_at, seconds, active_seconds, idle_seconds, app, domain) values ${rows.slice(i, i + 2000).join(',')} on conflict do nothing`));
  }
  console.log(`  ${rows.length} activity buckets`);
});

/* ------------------------- demo leads and calls ------------------------- */

await db.runAsTenant(demo.id, { userId: (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id }, async () => {
  const q = db.q;
  if (((await q.execute(sql`select count(*)::int as n from leads`)).rows[0] as { n: number }).n > 0) return;
  console.log('Seeding demo leads and calls…');
  const uid = (await db.app.select().from(users).where(eq(users.email, 'owner@meridian.test')))[0]!.id;
  const emps = (await q.execute(sql`select e.id from employees e join shifts s on s.id = e.shift_id where s.name = 'Field' and e.status = 'active' order by e.code limit 8`)).rows as { id: string }[];
  const stages = ['new', 'new', 'contacted', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
  const firms = ['Sri Murugan Traders', 'Annai Medicals', 'Deccan Hardware', 'Pearl Electronics', 'Sakthi Agencies', 'Metro Provisions', 'Blue Wave Cold Storage', 'Orchid Textiles', 'Kaveri Oils', 'Narmada Packaging', 'Lotus Stationers', 'Ganga Dairy'];
  for (let i = 0; i < firms.length; i++) {
    const stage = stages[i % stages.length]!;
    const code = await sequences.next('leads', 'LEAD');
    await q.execute(sql`insert into leads (tenant_id, code, name, company_name, phone, source, stage, owner_id, value, next_follow_up_at, lost_reason, created_by)
      values (app_tenant_id(), ${code}, ${faker.person.fullName()}, ${firms[i]}, ${`+9199${faker.string.numeric(8)}`}, ${['manual', 'referral', 'campaign', 'walk_in'][i % 4]}, ${stage}, ${emps[i % emps.length]!.id}::uuid, ${50000 + i * 35000},
        ${stage === 'won' || stage === 'lost' ? null : new Date(Date.now() + (i - 3) * 86_400_000).toISOString()}::timestamptz, ${stage === 'lost' ? 'Price too high' : null}, ${uid}::uuid)`);
  }
  for (let i = 0; i < 20; i++) {
    await q.execute(sql`insert into call_logs (tenant_id, employee_id, direction, phone, started_at, duration_seconds, outcome, created_by)
      values (app_tenant_id(), ${emps[i % emps.length]!.id}::uuid, ${['outgoing', 'outgoing', 'incoming', 'missed'][i % 4]}, ${`+9198${faker.string.numeric(8)}`}, ${new Date(Date.now() - (i + 1) * 5_400_000).toISOString()}::timestamptz, ${faker.number.int({ min: 0, max: 600 })}, ${['connected', 'connected', 'no_answer', 'busy'][i % 4]}, ${uid}::uuid)`);
  }

  // Cloud calling is on for the demo company, in mock mode. One finished call with a synthetic recording (a tone pattern) to play.
  for (const [key, value] of [['calls.provider', 'trackrex'], ['calls.record_calls', true]] as const) {
    await q.execute(sql`insert into settings (tenant_id, scope_type, scope_id, key, value, updated_by) values (app_tenant_id(), 'tenant', null, ${key}, ${JSON.stringify(value)}::jsonb, ${uid}::uuid)
      on conflict (tenant_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), key) do update set value = excluded.value, updated_at = now()`);
  }
  const cust = (await q.execute(sql`select id, phone from customers where phone is not null order by created_at limit 1`)).rows[0] as { id: string; phone: string } | undefined;
  const already = (await q.execute(sql`select 1 from call_sessions where provider = 'mock-telephony' limit 1`)).rows.length > 0;
  if (cust && !already) {
    const sid = crypto.randomUUID();
    const key = `recordings/${demo.id}/${sid}.wav`;
    const wav = syntheticWav(12);
    await app.get<StorageProvider>(STORAGE).put(key, await app.get(EnvelopeService).seal(`call.recording:${key}`, wav));
    const log = (await q.execute(sql`insert into call_logs (tenant_id, employee_id, direction, phone, started_at, duration_seconds, outcome, customer_id, notes)
      values (app_tenant_id(), ${emps[0]!.id}::uuid, 'outgoing', ${cust.phone}, now() - interval '2 hours', 118, 'connected', ${cust.id}::uuid, 'Placed through Trackrex calling (mock).') returning id`)).rows[0] as { id: string };
    await q.execute(sql`insert into call_sessions (id, tenant_id, employee_id, customer_id, agent_number, customer_number, status, provider, provider_call_id, recording_requested, recording_key, recording_seconds, started_at, answered_at, ended_at, duration_seconds, call_log_id, created_by)
      values (${sid}::uuid, app_tenant_id(), ${emps[0]!.id}::uuid, ${cust.id}::uuid, '+919800000000', ${cust.phone}, 'completed', 'mock-telephony', ${`mock-seed-${sid.slice(0, 8)}`}, true, ${key}, 12,
              now() - interval '2 hours', now() - interval '2 hours' + interval '9 seconds', now() - interval '2 hours' + interval '127 seconds', 118, ${log.id}::uuid, ${uid}::uuid)`);
  }
});

await app.close();
console.log('\nSeed complete. Sign-in details (all passwords: ' + PASSWORD + '):');
console.log('  Platform console  admin@vintorex.test     (2FA secret ' + DEV_TOTP + ')');
console.log('  Demo company      owner@meridian.test     tenant: meridian-demo');
console.log('  HR admin          hr@meridian.test        manager: manager@meridian.test    employee: employee@meridian.test');
console.log('  Two companies     consultant@trackrex.test (lakshmi-textiles, coastal-logistics)');
void admin;
