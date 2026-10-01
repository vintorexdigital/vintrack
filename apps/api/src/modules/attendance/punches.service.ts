import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { insideFence, haversineMeters, zonedToUtcMs, addDays, type Fence } from '@trackrex/rules';
import { punchBody, type PunchBody } from '@trackrex/schemas';
import { inCidr } from '../../core/auth/ip.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { conflict, forbidden, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { AuditService } from '../../core/audit.service.js';
import { OutboxService } from '../../core/outbox.service.js';
import { STORAGE, type StorageProvider } from '../files/storage.js';
import { ShiftResolver, type ShiftInfo } from '../time/shift-resolver.service.js';
import { AttendanceEngine } from './attendance-engine.service.js';

type Source = 'mobile' | 'desktop' | 'web' | 'system' | 'admin';

export interface PunchRow {
  id: string;
  employeeId: string;
  type: 'in' | 'out';
  at: string;
  attendanceDate: string;
  source: Source;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  comment: string | null;
  mockLocation: boolean;
  offline: boolean;
}

const sourceFor = (s: string): Source => (s === 'mobile' ? 'mobile' : s === 'desktop' ? 'desktop' : 'web');
const MAX_OFFLINE_AGE_MS = 7 * 86_400_000;

@Injectable()
export class PunchesService {
  constructor(
    private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly settings: SettingsService,
    private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly shifts: ShiftResolver, private readonly engine: AttendanceEngine, @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  /** Which employee a punch is for, and whether the caller may punch for them. */
  private async resolveEmployee(bodyEmployeeId: string | undefined): Promise<{ employeeId: string; onBehalf: boolean }> {
    const auth = currentAuth();
    if (bodyEmployeeId && bodyEmployeeId !== auth.employeeId) {
      const scope = this.authz.require('attendance.punch.override');
      const pred = this.scope.predicate(scope, sql`e.id`);
      const res = await this.db.q.execute(sql`select 1 from employees e where e.id = ${bodyEmployeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
      if (!res.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
      return { employeeId: bodyEmployeeId, onBehalf: true };
    }
    this.authz.require('attendance.punch.create');
    if (!auth.employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    return { employeeId: auth.employeeId, onBehalf: false };
  }

  private async lastPunch(employeeId: string, beforeMs?: number): Promise<{ type: 'in' | 'out'; at: string; attendance_date: string; source: string; comment: string | null } | undefined> {
    const res = await this.db.q.execute(sql`
      select type, at, attendance_date, source, comment from punches where employee_id = ${employeeId}::uuid
      ${beforeMs ? sql`and at <= ${new Date(beforeMs).toISOString()}::timestamptz` : sql``} order by at desc limit 1`);
    return res.rows[0] as never;
  }

  async punch(rawBody: unknown): Promise<PunchRow & { warnings: string[] }> {
    const body = punchBody.parse(rawBody ?? {});
    const store = currentStore();
    const { employeeId, onBehalf } = await this.resolveEmployee(body.employeeId);
    const source: Source = onBehalf ? 'admin' : sourceFor(store.source);
    const platformKey = sourceFor(store.source) as 'mobile' | 'desktop' | 'web';
    void platformKey;

    const empRes = await this.db.q.execute(sql`select id, status, date_of_joining, home_latitude, home_longitude from employees where id = ${employeeId}::uuid and deleted_at is null`);
    const emp = empRes.rows[0] as { id: string; status: string; date_of_joining: string; home_latitude: number | null; home_longitude: number | null } | undefined;
    if (!emp || emp.status !== 'active') throw forbidden('Only active employees can punch.', 'employee_inactive');

    const now = Date.now();
    let at = now;
    if (body.at && (body.offline || onBehalf)) {
      const t = new Date(body.at).getTime();
      if (t > now + 5 * 60_000) throw unprocessable('The punch time is in the future.', [{ path: 'at', message: 'Cannot be in the future' }]);
      if (now - t > MAX_OFFLINE_AGE_MS) throw unprocessable('Offline punches older than 7 days need a regularization request.', [{ path: 'at', message: 'Too old' }], 'punch_too_old');
      at = t;
    }
    const resolved = await this.shifts.forInstant(employeeId, at);
    if (!resolved) throw unprocessable('You have no working shift. Ask your manager to assign one.', undefined, 'no_shift_assigned');
    const { shift, date } = resolved;

    const last = await this.lastPunch(employeeId, at);
    const type = body.type ?? (last?.type === 'in' ? 'out' : 'in');
    if (type === 'in' && last?.type === 'in') throw conflict('already_punched_in', 'You are already punched in.');
    if (type === 'out' && (!last || last.type === 'out')) throw conflict('not_punched_in', 'You are not punched in.');

    if (!onBehalf) await this.checkRestrictions({ body, type, shift, date, at, platformKey, emp, ip: store.ip, employeeId });

    const inserted = await this.db.q.execute(sql`
      insert into punches (tenant_id, employee_id, type, at, attendance_date, source, shift_id, device_id, ip, latitude, longitude, accuracy, address, selfie_key, comment, mock_location, offline, client_at, created_by)
      values (app_tenant_id(), ${employeeId}::uuid, ${type}, ${new Date(at).toISOString()}::timestamptz, ${date}::date, ${source}, ${shift.id}::uuid, ${body.deviceId ?? null}, ${store.ip ?? null},
              ${body.latitude ?? null}, ${body.longitude ?? null}, ${body.accuracy ?? null}, ${body.address ?? null}, ${body.selfieKey ?? null}, ${body.comment ?? null},
              ${body.mockLocation ?? false}, ${body.offline ?? false}, ${body.at ?? null}::timestamptz, ${currentAuth().userId}::uuid)
      returning id, employee_id, type, at, attendance_date, source, latitude, longitude, address, comment, mock_location, offline`);
    const r = inserted.rows[0] as Record<string, unknown>;
    if (onBehalf) {
      await this.audit.record({ entity: 'punches', entityId: r.id as string, action: 'punched_on_behalf', changes: { employeeId: { new: employeeId }, type: { new: type }, comment: { new: body.comment ?? null } } });
    }
    await this.outbox.emit(`punch.${type === 'in' ? 'in' : 'out'}`, { employeeId, at: new Date(at).toISOString(), source, date });
    await this.engine.recomputeDay(employeeId, date);
    const warnings: string[] = [];
    if (body.mockLocation) warnings.push('mock_location');
    return { id: r.id as string, employeeId, type, at: new Date(r.at as string).toISOString(), attendanceDate: date, source, latitude: (r.latitude as number) ?? null, longitude: (r.longitude as number) ?? null, address: (r.address as string) ?? null, comment: (r.comment as string) ?? null, mockLocation: !!r.mock_location, offline: !!r.offline, warnings };
  }

  /** Every shift restriction, checked on the server whatever the client app did. */
  private async checkRestrictions(c: { body: PunchBody; type: 'in' | 'out'; shift: ShiftInfo; date: string; at: number; platformKey: 'mobile' | 'desktop' | 'web'; emp: { home_latitude: number | null; home_longitude: number | null }; ip: string | undefined; employeeId: string }): Promise<void> {
    const { body, type, shift, date, at, platformKey, emp } = c;
    const r = shift.rules;
    const fail = (code: string, message: string, path?: string) => { throw unprocessable(message, path ? [{ path, message }] : undefined, code); };

    if (!r.platforms.punchSources.includes(platformKey)) fail('punch_source_not_allowed', `Your shift does not allow punching from ${platformKey === 'web' ? 'the web' : platformKey === 'mobile' ? 'the mobile app' : 'the desktop app'}.`);

    if (platformKey !== 'mobile' && r.punch.ipAllowlist.length) {
      if (!c.ip || !r.punch.ipAllowlist.some((cidr) => inCidr(c.ip!, cidr))) fail('punch_ip_not_allowed', 'Punching is only allowed from your office network.');
    }
    if (r.punch.commentOnIn && type === 'in' && !body.comment?.trim()) fail('comment_required', 'Add a comment to punch in.', 'comment');
    if (r.punch.commentOnOut && type === 'out' && !body.comment?.trim()) fail('comment_required', 'Add a comment to punch out.', 'comment');

    if (type === 'in') {
      const start = zonedToUtcMs(date, shift.timing.startTime, shift.timing.timezone);
      if (r.punch.blockEarlyMinutes != null && at < start - r.punch.blockEarlyMinutes * 60_000) fail('punch_too_early', `You can punch in from ${r.punch.blockEarlyMinutes} minutes before your shift starts.`);
      if (r.punch.blockAfterMaxPunchIn) {
        const latest = zonedToUtcMs(date, shift.timing.maxPunchInTime ?? shift.timing.startTime, shift.timing.timezone);
        if (at > latest) fail('punch_too_late', 'The latest punch-in time for your shift has passed. Ask your manager.');
      }
      if (await this.settings.get<boolean>('attendance.block_punch_on_leave', false)) {
        const lv = await this.db.q.execute(sql`select 1 from leave_requests where employee_id = ${c.employeeId}::uuid and status = 'approved' and deleted_at is null and from_date <= ${date}::date and to_date >= ${date}::date and duration = 'full' limit 1`);
        if (lv.rows.length) fail('punch_on_leave', 'You are on approved leave today.');
      }
      if (r.autoPunchOut.enabled && r.autoPunchOut.blockAfter) {
        const auto = await this.db.q.execute(sql`select 1 from punches where employee_id = ${c.employeeId}::uuid and attendance_date = ${date}::date and source = 'system' and type = 'out' limit 1`);
        if (auto.rows.length) fail('blocked_after_auto_punch_out', 'You were punched out automatically. You can punch in again on the next working day.');
      }
    }

    const needsProof = platformKey === 'mobile' && !r.punch.allowAppWithoutProof;
    if (needsProof && r.punch.selfie === 'mandatory' && !body.selfieKey) fail('selfie_required', 'Take a selfie to punch.', 'selfieKey');
    if (body.selfieKey) {
      const own = `selfies/${currentStore().tenantId}/${currentAuth().userId}/`;
      if (!body.selfieKey.startsWith(own) || !(await this.storage.exists(body.selfieKey))) fail('selfie_not_uploaded', 'The selfie has not reached the server yet. Try again in a moment.', 'selfieKey');
    }
    const locationRequired = r.punch.location === 'mandatory' && platformKey !== 'desktop' && !(platformKey === 'mobile' && r.punch.allowAppWithoutProof);
    const hasLocation = body.latitude !== undefined && body.longitude !== undefined;
    if (locationRequired && !hasLocation) fail('location_required', 'Turn on location to punch.', 'latitude');

    if (hasLocation) {
      const point = { lat: body.latitude!, lng: body.longitude! };
      const fenceIds = type === 'in' ? r.punch.fencesIn : r.punch.fencesOut;
      if (fenceIds.length) {
        const fr = await this.db.q.execute(sql`select fence_type, latitude, longitude, radius_meters, polygon from geo_fences where deleted_at is null and status = 'active' and id = any(${sql.param(fenceIds)}::uuid[])`);
        const fences: Fence[] = (fr.rows as { fence_type: string; latitude: number | null; longitude: number | null; radius_meters: number | null; polygon: { lat: number; lng: number }[] | null }[]).flatMap((f) =>
          f.fence_type === 'polygon' && f.polygon ? [{ type: 'polygon', points: f.polygon } as Fence] : f.latitude != null && f.longitude != null ? [{ type: 'circle', center: { lat: f.latitude, lng: f.longitude }, radiusMeters: f.radius_meters ?? 150 } as Fence] : []);
        if (fences.length && !fences.some((f) => insideFence(point, f, Math.min(body.accuracy ?? 0, 50)))) fail('outside_fence', `You must be inside an allowed location to punch ${type}.`);
      }
      if (r.punch.blockAtHome.enabled && emp.home_latitude != null && emp.home_longitude != null) {
        if (haversineMeters(point, { lat: emp.home_latitude, lng: emp.home_longitude }) <= r.punch.blockAtHome.radiusMeters) fail('punch_at_home', 'Punching at your home location is not allowed.');
      }
    }

    if (platformKey === 'mobile' && r.mobile.deviceBinding) {
      if (!body.deviceId) fail('device_required', 'This app version did not send a device ID.', 'deviceId');
      const dev = await this.db.q.execute(sql`select device_id from devices where employee_id = ${c.employeeId}::uuid and revoked_at is null and platform = ${body.platform ?? 'android'} limit 1`);
      const bound = dev.rows[0] as { device_id: string } | undefined;
      if (!bound) {
        await this.db.q.execute(sql`insert into devices (tenant_id, employee_id, device_id, platform, last_seen_at) values (app_tenant_id(), ${c.employeeId}::uuid, ${body.deviceId!}, ${body.platform ?? 'android'}, now())`);
      } else if (bound.device_id !== body.deviceId) {
        throw forbidden('This phone is not the one registered for your account. Ask your admin to reset your device.', 'device_not_bound');
      }
    }
  }

  /* ---------- reading ---------- */

  async list(q: { employeeId?: string; date?: string; from?: string; to?: string; limit?: number; cursor?: string }) {
    const scope = this.authz.require('attendance.punch.read');
    const pred = this.scope.predicate(scope, sql`p.employee_id`);
    const limit = Math.min(Number(q.limit ?? 100), 200);
    const cur = q.cursor ? JSON.parse(Buffer.from(q.cursor, 'base64url').toString()) as { at: string; id: string } : null;
    const res = await this.db.q.execute(sql`
      select p.id, p.employee_id as "employeeId", e.display_name as "employeeName", e.code as "employeeCode", p.type, p.at, p.attendance_date as "attendanceDate", p.source,
             p.latitude, p.longitude, p.accuracy, p.address, p.selfie_key as "selfieKey", p.comment, p.mock_location as "mockLocation", p.offline, p.ip
      from punches p join employees e on e.id = p.employee_id and e.tenant_id = p.tenant_id
      where true
        ${q.employeeId ? sql`and p.employee_id = ${q.employeeId}::uuid` : sql``}
        ${q.date ? sql`and p.attendance_date = ${q.date}::date` : sql``}
        ${q.from ? sql`and p.attendance_date >= ${q.from}::date` : sql``}
        ${q.to ? sql`and p.attendance_date <= ${q.to}::date` : sql``}
        ${pred ? sql`and ${pred}` : sql``}
        ${cur ? sql`and (p.at, p.id) < (${cur.at}::timestamptz, ${cur.id}::uuid)` : sql``}
      order by p.at desc, p.id desc limit ${limit + 1}`);
    const rows = res.rows as { id: string; at: string }[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { data: page, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ at: new Date(last.at).toISOString(), id: last.id })).toString('base64url') : null };
  }

  /** The viewer's own punch state, what the next punch will need, and today's totals. Drives the punch widget. */
  async myStatus() {
    this.authz.require('attendance.punch.create');
    const auth = currentAuth();
    if (!auth.employeeId) return { linked: false };
    const now = Date.now();
    const resolved = await this.shifts.forInstant(auth.employeeId, now);
    const last = await this.lastPunch(auth.employeeId);
    const open = await this.db.q.execute(sql`select b.id, b.started_at as "startedAt", t.name from breaks b left join break_types t on t.id = b.break_type_id where b.employee_id = ${auth.employeeId}::uuid and b.ended_at is null limit 1`);
    const day = resolved ? await this.engine.recomputeDay(auth.employeeId, resolved.date, now) : null;
    const platform = sourceFor(currentStore().source) as 'mobile' | 'desktop' | 'web';
    return {
      linked: true,
      state: open.rows.length ? 'break' : last?.type === 'in' ? 'in' : 'out',
      since: last ? new Date(last.at).toISOString() : null,
      attendanceDate: resolved?.date ?? null,
      shift: resolved ? { id: resolved.shift.id, name: resolved.shift.name, startTime: resolved.shift.timing.startTime, timezone: resolved.shift.timing.timezone, workingMinutes: resolved.shift.timing.workingMinutes } : null,
      requirements: resolved ? {
        sourceAllowed: resolved.shift.rules.platforms.punchSources.includes(platform),
        selfie: platform === 'mobile' && !resolved.shift.rules.punch.allowAppWithoutProof ? resolved.shift.rules.punch.selfie : 'off',
        location: resolved.shift.rules.punch.location,
        commentOnIn: resolved.shift.rules.punch.commentOnIn,
        commentOnOut: resolved.shift.rules.punch.commentOnOut,
      } : null,
      openBreak: open.rows[0] ?? null,
      today: day ? { workedMinutes: day.workedMinutes, breakMinutes: day.breakMinutes, lateMinutes: day.lateMinutes, statusCode: day.statusCode } : null,
    };
  }

  /* ---------- breaks ---------- */

  async startBreak(breakTypeId?: string) {
    this.authz.require('attendance.punch.create');
    const auth = currentAuth();
    if (!auth.employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    const last = await this.lastPunch(auth.employeeId);
    if (last?.type !== 'in') throw conflict('not_punched_in', 'Punch in before starting a break.');
    const resolved = await this.shifts.forInstant(auth.employeeId, Date.now());
    const platform = sourceFor(currentStore().source) as 'mobile' | 'desktop' | 'web';
    if (resolved && !resolved.shift.rules.platforms.breakPlatforms.includes(platform)) throw unprocessable('Your shift does not allow starting breaks here.', undefined, 'break_source_not_allowed');
    try {
      const res = await this.db.q.execute(sql`insert into breaks (tenant_id, employee_id, break_type_id, attendance_date, started_at, source) values (app_tenant_id(), ${auth.employeeId}::uuid, ${breakTypeId ?? null}::uuid, ${last.attendance_date}::date, now(), ${platform}) returning id, started_at as "startedAt"`);
      return res.rows[0];
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code === '23505') throw conflict('break_open', 'A break is already running.');
      throw e;
    }
  }

  async endBreak() {
    this.authz.require('attendance.punch.create');
    const auth = currentAuth();
    const res = await this.db.q.execute(sql`update breaks set ended_at = now() where employee_id = ${auth.employeeId}::uuid and ended_at is null returning id, attendance_date, started_at as "startedAt", ended_at as "endedAt"`);
    const row = res.rows[0] as { attendance_date: string } | undefined;
    if (!row) throw conflict('no_break', 'There is no running break.');
    await this.engine.recomputeDay(auth.employeeId!, row.attendance_date);
    return row;
  }

  /* ---------- automatic punch-out ---------- */

  /**
   * Close sessions left open past each shift's auto punch-out rule. Safe to run every few minutes:
   * each open session is closed once, at the computed cutoff time, as a system punch.
   */
  async autoPunchOut(now = Date.now()): Promise<number> {
    const open = await this.db.q.execute(sql`
      select distinct on (p.employee_id) p.employee_id, p.at, p.attendance_date, p.type
      from punches p order by p.employee_id, p.at desc`);
    let closed = 0;
    for (const row of open.rows as { employee_id: string; at: string; attendance_date: string; type: string }[]) {
      if (row.type !== 'in') continue;
      const shift = await this.shifts.forDate(row.employee_id, row.attendance_date);
      if (!shift?.rules.autoPunchOut.enabled) continue;
      const rule = shift.rules.autoPunchOut;
      const inAt = new Date(row.at).getTime();
      let cutoff: number;
      if (rule.mode === 'hours') cutoff = inAt + rule.hours * 3_600_000;
      else {
        cutoff = zonedToUtcMs(row.attendance_date, rule.clockTime, shift.timing.timezone);
        if (cutoff <= inAt) cutoff = zonedToUtcMs(addDays(row.attendance_date, 1), rule.clockTime, shift.timing.timezone);
      }
      if (now < cutoff) continue;
      await this.db.q.execute(sql`
        insert into punches (tenant_id, employee_id, type, at, attendance_date, source, shift_id, comment)
        values (app_tenant_id(), ${row.employee_id}::uuid, 'out', ${new Date(cutoff).toISOString()}::timestamptz, ${row.attendance_date}::date, 'system', ${shift.id}::uuid, 'Auto punch-out')`);
      await this.db.q.execute(sql`update breaks set ended_at = ${new Date(cutoff).toISOString()}::timestamptz where employee_id = ${row.employee_id}::uuid and ended_at is null`);
      await this.outbox.emit('punch.auto_out', { employeeId: row.employee_id, at: new Date(cutoff).toISOString() });
      await this.engine.recomputeDay(row.employee_id, row.attendance_date, now);
      closed++;
    }
    return closed;
  }
}
