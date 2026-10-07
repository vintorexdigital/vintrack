import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { cleanTrack, detectStops, trackDistanceMeters, travelMinutes, withinIntervals, workingIntervals, type TrackPoint } from '@trackrex/rules';
import { pingBatchBody, trailQuery } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { forbidden, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { EnvelopeService, PURPOSE } from '../../core/crypto/envelope.service.js';

const MAX_AGE_MS = 7 * 86_400_000;
const FUTURE_SLACK_MS = 5 * 60_000;
const MOVING_MS = 1; // m/s

/**
 * Location is recorded only while an employee is punched in, and only when the company has turned
 * tracking on. Both are enforced here whatever the app sends.
 */
@Injectable()
export class TrackingService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly settings: SettingsService, private readonly envelope: EnvelopeService) {}

  async ingest(rawBody: unknown): Promise<{ accepted: number; outsideWorkingTime: number; duplicate: number; stale: number; trackingEnabled: boolean; intervalSeconds: number }> {
    this.authz.require('location.ping.create');
    const body = pingBatchBody.parse(rawBody ?? {});
    const auth = currentAuth();
    if (!auth.employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    const employeeId = auth.employeeId;
    const enabled = await this.settings.get<boolean>('geo.tracking_enabled', true);
    const intervalSeconds = await this.settings.get<number>('geo.ping_interval_seconds', 120);
    if (!enabled) return { accepted: 0, outsideWorkingTime: 0, duplicate: 0, stale: 0, trackingEnabled: false, intervalSeconds };

    const now = Date.now();
    const pings = body.pings.map((p) => ({ ...p, ms: new Date(p.at).getTime() }));
    const fresh = pings.filter((p) => p.ms <= now + FUTURE_SLACK_MS && now - p.ms <= MAX_AGE_MS);
    const stale = pings.length - fresh.length;
    if (!fresh.length) return { accepted: 0, outsideWorkingTime: 0, duplicate: 0, stale, trackingEnabled: true, intervalSeconds };

    const minMs = Math.min(...fresh.map((p) => p.ms));
    const punchRes = await this.db.q.execute(sql`
      select type, at from punches where employee_id = ${employeeId}::uuid and at >= ${new Date(minMs - 36 * 3_600_000).toISOString()}::timestamptz order by at`);
    const intervals = workingIntervals((punchRes.rows as { type: 'in' | 'out'; at: string }[]).map((r) => ({ type: r.type, at: new Date(r.at).getTime() })), now);
    const inside = fresh.filter((p) => withinIntervals(p.ms, intervals));
    const outsideWorkingTime = fresh.length - inside.length;
    if (!inside.length) return { accepted: 0, outsideWorkingTime, duplicate: 0, stale, trackingEnabled: true, intervalSeconds };

    const seal = this.envelope.enabled;
    const values = await Promise.all(inside.map(async (p) => {
      const sealed = seal ? await this.envelope.sealPoint(PURPOSE.locationPoint, { lat: p.latitude, lng: p.longitude }) : null;
      return sql`(app_tenant_id(), ${employeeId}::uuid, ${p.at}::timestamptz, ${seal ? null : p.latitude}, ${seal ? null : p.longitude}, ${sealed}, ${p.accuracy ?? null}, ${p.speed ?? null}, ${p.heading ?? null}, ${p.battery ?? null}, ${p.provider ?? null}, ${p.mockLocation ?? false}, ${body.deviceId ?? null})`;
    }));
    const res = await this.db.q.execute(sql`
      insert into location_pings (tenant_id, employee_id, at, latitude, longitude, sealed, accuracy, speed, heading, battery, provider, mock, device_id)
      values ${sql.join(values, sql`, `)} on conflict (tenant_id, employee_id, at) do nothing`);
    const accepted = res.rowCount ?? 0;

    const latest = [...inside].filter((p) => !p.mockLocation).sort((a, b) => b.ms - a.ms)[0];
    if (latest) {
      const liveSealed = seal ? await this.envelope.sealPoint(PURPOSE.liveLocation, { lat: latest.latitude, lng: latest.longitude }) : null;
      await this.db.q.execute(sql`
        insert into live_locations (tenant_id, employee_id, at, latitude, longitude, sealed, accuracy, battery, moving)
        values (app_tenant_id(), ${employeeId}::uuid, ${latest.at}::timestamptz, ${seal ? null : latest.latitude}, ${seal ? null : latest.longitude}, ${liveSealed}, ${latest.accuracy ?? null}, ${latest.battery ?? null}, ${(latest.speed ?? 0) > MOVING_MS})
        on conflict (tenant_id, employee_id) do update set at = excluded.at, latitude = excluded.latitude, longitude = excluded.longitude, sealed = excluded.sealed,
          accuracy = excluded.accuracy, battery = excluded.battery, moving = excluded.moving, updated_at = now()
        where live_locations.at < excluded.at`);
    }
    return { accepted, outsideWorkingTime, duplicate: inside.length - accepted, stale, trackingEnabled: true, intervalSeconds };
  }

  /** What the app needs to know before it starts sending: is tracking on and how often. Always shown to the employee. */
  async policy(): Promise<{ enabled: boolean; intervalSeconds: number }> {
    return { enabled: await this.settings.get<boolean>('geo.tracking_enabled', true), intervalSeconds: await this.settings.get<number>('geo.ping_interval_seconds', 120) };
  }

  /** Latest position per employee in the viewer's scope. Only people who are punched in, or were within the last 15 minutes, show up. */
  async live(): Promise<{ data: LiveRow[]; asOf: string }> {
    const pred = this.scope.predicate(this.authz.require('location.live.read'), sql`l.employee_id`);
    const res = await this.db.q.execute(sql`
      select l.employee_id, e.code, e.display_name, l.at, l.latitude, l.longitude, l.sealed, l.accuracy, l.battery, l.moving,
             (select p.type from punches p where p.employee_id = l.employee_id order by p.at desc limit 1) as last_punch
        from live_locations l join employees e on e.id = l.employee_id
       where e.deleted_at is null and e.status = 'active' ${pred ? sql`and ${pred}` : sql``}
         and (l.at > now() - interval '15 minutes' or exists (select 1 from punches p2 where p2.employee_id = l.employee_id and p2.at > now() - interval '24 hours'))
       order by l.at desc limit 500`);
    const now = Date.now();
    const data = await Promise.all((res.rows as Record<string, unknown>[]).map(async (r): Promise<LiveRow> => {
      const at = new Date(r.at as string).getTime();
      const working = r.last_punch === 'in';
      const pos = r.sealed ? await this.envelope.openPoint(PURPOSE.liveLocation, r.sealed as string) : { lat: r.latitude as number, lng: r.longitude as number };
      return {
        employeeId: r.employee_id as string, code: r.code as string | null, name: r.display_name as string,
        at: new Date(at).toISOString(), latitude: pos.lat, longitude: pos.lng, accuracy: (r.accuracy as number) ?? null, battery: (r.battery as number) ?? null,
        status: !working ? 'off_duty' : now - at > 15 * 60_000 ? 'stale' : r.moving ? 'moving' : 'stopped',
      };
    }));
    return { data, asOf: new Date(now).toISOString() };
  }

  /** One employee's day: cleaned points, stops and distance, from their attendance date's working intervals. */
  async trail(rawQuery: unknown): Promise<TrailResult> {
    const q = trailQuery.parse(rawQuery);
    const pred = this.scope.predicate(this.authz.require('location.trail.read'), sql`e.id`);
    const ok = await this.db.q.execute(sql`select 1 from employees e where e.id = ${q.employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
    const pun = await this.db.q.execute(sql`select type, at from punches where employee_id = ${q.employeeId}::uuid and attendance_date = ${q.date}::date order by at`);
    const intervals = workingIntervals((pun.rows as { type: 'in' | 'out'; at: string }[]).map((r) => ({ type: r.type, at: new Date(r.at).getTime() })), Date.now());
    if (!intervals.length) return { employeeId: q.employeeId, date: q.date, points: [], stops: [], distanceMeters: 0, travelMinutes: 0, workingMinutes: 0 };
    const from = Math.min(...intervals.map((i) => i.start));
    const to = Math.max(...intervals.map((i) => i.end));
    if (to - from > 3 * 86_400_000) throw unprocessable('That range is too long.');
    const res = await this.db.q.execute(sql`
      select at, latitude, longitude, sealed, accuracy, speed from location_pings
       where employee_id = ${q.employeeId}::uuid and mock = false and at between ${new Date(from).toISOString()}::timestamptz and ${new Date(to).toISOString()}::timestamptz order by at limit 5000`);
    const raw = (await Promise.all((res.rows as { at: string; latitude: number | null; longitude: number | null; sealed: string | null; accuracy: number | null; speed: number | null }[]).map(async (r): Promise<TrackPoint> => {
      const pos = r.sealed ? await this.envelope.openPoint(PURPOSE.locationPoint, r.sealed) : { lat: r.latitude!, lng: r.longitude! };
      return { at: new Date(r.at).getTime(), lat: pos.lat, lng: pos.lng, accuracy: r.accuracy, speed: r.speed };
    }))).filter((p) => withinIntervals(p.at, intervals));
    const points = cleanTrack(raw);
    const stops = detectStops(points);
    return {
      employeeId: q.employeeId, date: q.date,
      points: points.map((p) => ({ at: new Date(p.at).toISOString(), lat: p.lat, lng: p.lng })),
      stops: stops.map((s) => ({ lat: s.center.lat, lng: s.center.lng, arrival: new Date(s.arrival).toISOString(), departure: new Date(s.departure).toISOString(), minutes: s.minutes })),
      distanceMeters: trackDistanceMeters(points), travelMinutes: travelMinutes(points, stops),
      workingMinutes: Math.round(intervals.reduce((s, i) => s + (i.end - i.start), 0) / 60_000),
    };
  }

  /** Seals points recorded before envelope encryption was on (or while it was off), a batch at a time. Returns how many were sealed. */
  async sealLegacy(batch = 2000): Promise<number> {
    const rows = (await this.db.q.execute(sql`select id, at, latitude, longitude from location_pings where sealed is null and latitude is not null limit ${batch}`)).rows as { id: string; at: string; latitude: number; longitude: number }[];
    for (const r of rows) {
      const sealed = await this.envelope.sealPoint(PURPOSE.locationPoint, { lat: r.latitude, lng: r.longitude });
      await this.db.q.execute(sql`update location_pings set sealed = ${sealed}, latitude = null, longitude = null where id = ${r.id}::uuid and at = ${r.at}::timestamptz`);
    }
    const live = (await this.db.q.execute(sql`select employee_id, latitude, longitude from live_locations where sealed is null and latitude is not null`)).rows as { employee_id: string; latitude: number; longitude: number }[];
    for (const r of live) {
      const sealed = await this.envelope.sealPoint(PURPOSE.liveLocation, { lat: r.latitude, lng: r.longitude });
      await this.db.q.execute(sql`update live_locations set sealed = ${sealed}, latitude = null, longitude = null where employee_id = ${r.employee_id}::uuid`);
    }
    return rows.length + live.length;
  }

  /** Deletes points older than each company's retention window. Run by the worker. */
  async purgeOld(): Promise<number> {
    const days = await this.settings.get<number>('geo.trail_retention_days', 90);
    const res = await this.db.q.execute(sql`delete from location_pings where at < now() - make_interval(days => ${days})`);
    return res.rowCount ?? 0;
  }
}

export interface LiveRow { employeeId: string; code: string | null; name: string; at: string; latitude: number; longitude: number; accuracy: number | null; battery: number | null; status: 'moving' | 'stopped' | 'stale' | 'off_duty' }
export interface TrailResult {
  employeeId: string; date: string;
  points: { at: string; lat: number; lng: number }[];
  stops: { lat: number; lng: number; arrival: string; departure: string; minutes: number }[];
  distanceMeters: number; travelMinutes: number; workingMinutes: number;
}
