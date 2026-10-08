import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { idParam } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { Authz } from '../../core/rbac.service.js';
import { ChannelRouter } from '../../shared/providers/messaging/channels.js';
import type { OutboxHandler } from '../../jobs/outbox-relay.js';
import { deliver } from './delivery.js';
import type { MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';

interface Rule {
  /** Who is told: a function of the event payload and the database. */
  recipients(db: Db, p: Record<string, unknown>, actorUserId: string | null): Promise<string[]>;
  title(who: string, p: Record<string, unknown>): string;
  body?(p: Record<string, unknown>): string | null;
  link: string | ((p: Record<string, unknown>) => string);
}

const userForEmployee = async (db: Db, employeeId: string | undefined | null): Promise<string[]> => {
  if (!employeeId) return [];
  const r = await db.q.execute(sql`select user_id from platform.memberships where employee_id = ${employeeId}::uuid and status = 'active' and tenant_id = app_tenant_id()`);
  return (r.rows as { user_id: string }[]).map((x) => x.user_id);
};
const managerOf = async (db: Db, employeeId: string | undefined | null): Promise<string[]> => {
  if (!employeeId) return [];
  const r = await db.q.execute(sql`select reporting_manager_id as m from employees where id = ${employeeId}::uuid`);
  return userForEmployee(db, (r.rows[0] as { m: string | null } | undefined)?.m);
};
const employee = (db: Db, p: Record<string, unknown>) => userForEmployee(db, p.employeeId as string);
const range = (p: Record<string, unknown>) => (p.from ? `${String(p.from)} to ${String(p.to)}` : null);

const RULES: Record<string, Rule> = {
  'leave.requested': { recipients: (db, p) => managerOf(db, p.employeeId as string), title: (w) => `${w} applied for leave`, body: range, link: '/leave/requests?filter[status][eq]=pending' },
  'leave.approved': { recipients: (db, p) => employee(db, p), title: () => 'Your leave was approved', link: '/me/leave' },
  'leave.rejected': { recipients: (db, p) => employee(db, p), title: () => 'Your leave was rejected', link: '/me/leave' },
  'regularization.requested': { recipients: (db, p) => managerOf(db, p.employeeId as string), title: (w) => `${w} asked to regularize a day`, body: (p) => (p.date ? String(p.date) : null), link: '/attendance/regularizations?filter[status][eq]=pending' },
  'regularization.approved': { recipients: (db, p) => employee(db, p), title: () => 'Your regularization was approved', body: (p) => (p.date ? String(p.date) : null), link: '/me/attendance' },
  'regularization.rejected': { recipients: (db, p) => employee(db, p), title: () => 'Your regularization was rejected', body: (p) => (p.date ? String(p.date) : null), link: '/me/attendance' },
  'task.assigned': { recipients: (db, p) => employee(db, p), title: () => 'New task assigned', body: (p) => String(p.title ?? ''), link: '/field/my-tasks' },
  'task.completed': {
    recipients: async (db, p) => { const r = await db.q.execute(sql`select created_by from tasks where id = ${String(p.id)}::uuid`); const u = (r.rows[0] as { created_by: string | null } | undefined)?.created_by; return u ? [u] : []; },
    title: (w) => `${w} completed a task`, body: (p) => String(p.title ?? ''), link: '/field/tasks',
  },
  'expense.submitted': { recipients: (db, p) => managerOf(db, p.employeeId as string), title: (w) => `${w} submitted an expense claim`, body: (p) => `${String(p.currency ?? '')} ${String(p.amount ?? '')}`.trim(), link: '/expenses/claims?filter[status][eq]=pending' },
  'expense.approved': { recipients: (db, p) => employee(db, p), title: () => 'Your expense claim was approved', link: '/expenses/claims' },
  'expense.rejected': { recipients: (db, p) => employee(db, p), title: () => 'Your expense claim was rejected', link: '/expenses/claims' },
  'expense.paid': { recipients: (db, p) => employee(db, p), title: () => 'Your expense claim was paid', link: '/expenses/claims' },
  'approval.advanced': {
    recipients: (db, p) => userForEmployee(db, p.approverEmployeeId as string),
    title: (w, p) => `${w}'s ${String(p.subjectType).replace('regularization', 'regularization request')} needs your approval (step ${String(p.level)} of ${String(p.levels)})`,
    link: (p) => (p.subjectType === 'expense' ? '/expenses/claims?filter[status][eq]=pending' : p.subjectType === 'regularization' ? '/attendance/regularizations?filter[status][eq]=pending' : '/leave/requests?filter[status][eq]=pending'),
  },
  'payslip.published': { recipients: (db, p) => employee(db, p), title: (_w, p) => `Your payslip for ${String(p.label)} is ready`, link: '/me/payslips' },
  'ticket.replied': { recipients: (db, p) => employee(db, p), title: () => 'The help desk replied to your ticket', body: (p) => String(p.title ?? ''), link: '/helpdesk/tickets' },
  'ticket.resolved': { recipients: (db, p) => employee(db, p), title: () => 'Your ticket was resolved', body: (p) => String(p.title ?? ''), link: '/helpdesk/tickets' },
  'ticket.assigned': { recipients: (db, p) => employee(db, p), title: () => 'A ticket was assigned to you', body: (p) => String(p.title ?? ''), link: '/helpdesk/tickets' },
  'ticket.sla_breached': {
    recipients: async (db, p) => {
      if (p.assigneeId) return userForEmployee(db, p.assigneeId as string);
      const r = await db.q.execute(sql`select user_id from platform.memberships where tenant_id = app_tenant_id() and status = 'active' and (is_owner or role_keys && array['admin', 'hr_admin']::text[])`);
      return (r.rows as { user_id: string }[]).map((x) => x.user_id);
    },
    title: (w, p) => `${w}'s ticket missed its ${p.kind === 'response' ? 'first reply' : 'resolution'} deadline`, body: (p) => String(p.title ?? ''), link: '/helpdesk/tickets',
  },
  'lead.assigned': { recipients: (db, p) => employee(db, p), title: () => 'New lead assigned', body: (p) => String(p.title ?? ''), link: '/sales/leads' },
  'punch.auto_out': { recipients: (db, p) => employee(db, p), title: () => 'You were punched out automatically', body: () => 'You did not punch out at the end of your shift.', link: '/me/attendance' },
};

/** Outbox handler: turns domain events into per-recipient notifications, once each. */
export function notificationProjection(db: Db, mail?: { messaging: MessagingProvider; origin: string }): OutboxHandler {
  return async (e) => {
    const rule = RULES[e.type];
    if (!rule) return;
    const empId = e.payload.employeeId as string | undefined;
    let who = 'Someone';
    if (empId) {
      const r = await db.q.execute(sql`select display_name from employees where id = ${empId}::uuid`);
      who = (r.rows[0] as { display_name: string } | undefined)?.display_name ?? who;
    }
    const users = [...new Set(await rule.recipients(db, e.payload, e.actorUserId))].filter((u) => u !== e.actorUserId);
    const link = typeof rule.link === 'function' ? rule.link(e.payload) : rule.link;
    for (const userId of users) {
      await db.q.execute(sql`
        insert into notifications (tenant_id, user_id, type, title, body, link, event_id)
        values (${e.tenantId}::uuid, ${userId}::uuid, ${e.type}, ${rule.title(who, e.payload)}, ${rule.body?.(e.payload) ?? null}, ${link}, ${e.id})
        on conflict do nothing`);
    }
    if (mail && users.length) {
      // A delivery failure never blocks the event: the in-app notification above is the record.
      await deliver(db, mail.messaging, mail.origin, { userIds: users, type: e.type, title: rule.title(who, e.payload), body: rule.body?.(e.payload) ?? null, link, eventId: e.id }).catch(() => undefined);
    }
  };
}

const prefsBody = z.object({ email: z.boolean().optional(), sms: z.boolean().optional(), whatsapp: z.boolean().optional(), push: z.boolean().optional() });
const deviceBody = z.object({ token: z.string().min(8).max(300), platform: z.enum(['ios', 'android', 'web']) });
const listQuery = z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });

@Injectable()
export class NotificationsService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly router: ChannelRouter) {}

  async list(raw: Record<string, unknown>) {
    const q = listQuery.parse(raw);
    const me = currentAuth().userId;
    const rows = await this.db.q.execute(sql`
      select id, type, title, body, link, created_at as "createdAt", read_at as "readAt" from notifications
       where user_id = ${me}::uuid ${q.unread ? sql`and read_at is null` : sql``} order by created_at desc limit ${q.limit}`);
    const c = await this.db.q.execute(sql`select count(*)::int as n from notifications where user_id = ${me}::uuid and read_at is null`);
    return { data: rows.rows, unread: (c.rows[0] as { n: number }).n };
  }

  async read(id: string) {
    await this.db.q.execute(sql`update notifications set read_at = coalesce(read_at, now()) where id = ${id}::uuid and user_id = ${currentAuth().userId}::uuid`);
    return { ok: true };
  }

  async preferences() {
    const r = await this.db.q.execute(sql`select email, sms, whatsapp, push from notification_prefs where user_id = ${currentAuth().userId}::uuid`);
    const p = (r.rows[0] as { email: boolean; sms: boolean; whatsapp: boolean; push: boolean } | undefined) ?? { email: true, sms: false, whatsapp: false, push: true };
    const mobile = (await this.db.q.execute(sql`select coalesce(u.mobile, (select e.mobile from employees e join platform.memberships m on m.employee_id = e.id where m.user_id = u.id and m.tenant_id = app_tenant_id() limit 1)) as mobile from platform.users u where u.id = ${currentAuth().userId}::uuid`)).rows[0] as { mobile: string | null } | undefined;
    const devices = (await this.db.q.execute(sql`select count(*)::int as n from push_devices where user_id = ${currentAuth().userId}::uuid and revoked_at is null`)).rows[0] as { n: number };
    const names = this.router.names;
    return { ...p, hasMobile: !!mobile?.mobile, pushDevices: devices.n, providers: { sms: { name: names.sms, mock: this.router.isMock('sms') }, whatsapp: { name: names.whatsapp, mock: this.router.isMock('whatsapp') }, push: { name: names.push, mock: this.router.isMock('push') } } };
  }

  async setPreferences(raw: unknown) {
    const b = prefsBody.parse(raw ?? {});
    const cur = await this.preferences();
    const next = { email: b.email ?? cur.email, sms: b.sms ?? cur.sms, whatsapp: b.whatsapp ?? cur.whatsapp, push: b.push ?? cur.push };
    await this.db.q.execute(sql`
      insert into notification_prefs (tenant_id, user_id, email, sms, whatsapp, push) values (app_tenant_id(), ${currentAuth().userId}::uuid, ${next.email}, ${next.sms}, ${next.whatsapp}, ${next.push})
      on conflict (tenant_id, user_id) do update set email = excluded.email, sms = excluded.sms, whatsapp = excluded.whatsapp, push = excluded.push, updated_at = now()`);
    return next;
  }

  async registerDevice(raw: unknown) {
    const b = deviceBody.parse(raw ?? {});
    await this.db.q.execute(sql`
      insert into push_devices (tenant_id, user_id, token, platform) values (app_tenant_id(), ${currentAuth().userId}::uuid, ${b.token}, ${b.platform})
      on conflict (tenant_id, user_id, token) do update set revoked_at = null, last_seen_at = now(), platform = excluded.platform`);
    return { ok: true };
  }

  async revokeDevice(raw: unknown) {
    const b = z.object({ token: z.string().min(1) }).parse(raw ?? {});
    await this.db.q.execute(sql`update push_devices set revoked_at = now() where user_id = ${currentAuth().userId}::uuid and token = ${b.token}`);
    return { ok: true };
  }

  /** What the company's systems have sent to people, newest first. Message text can mention people, so it is for administrators. */
  async messageLog(raw: Record<string, unknown>) {
    this.authz.require('company.messages.read');
    const q = z.object({ channel: z.enum(['email', 'sms', 'whatsapp', 'push']).optional(), status: z.enum(['sent', 'failed']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(raw);
    const rows = await this.db.q.execute(sql`
      select l.id, l.channel, l.to_address as "to", l.template, l.subject, l.body, l.status, l.provider, l.error, l.created_at as "createdAt", u.name as "userName"
        from message_log l left join platform.users u on u.id = l.user_id
       where true ${q.channel ? sql`and l.channel = ${q.channel}` : sql``} ${q.status ? sql`and l.status = ${q.status}` : sql``}
       order by l.created_at desc limit ${q.limit}`);
    const names = this.router.names;
    return { data: rows.rows, providers: (['email', 'sms', 'whatsapp', 'push'] as const).map((c) => ({ channel: c, provider: names[c], mock: this.router.isMock(c) })) };
  }

  async readAll() {
    const r = await this.db.q.execute(sql`update notifications set read_at = now() where user_id = ${currentAuth().userId}::uuid and read_at is null`);
    return { updated: r.rowCount ?? 0 };
  }
}

@Controller('notifications')
class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get() list(@Query() q: Record<string, unknown>) { return this.svc.list(q); }
  @Get('preferences') preferences() { return this.svc.preferences(); }
  @Put('preferences') @HttpCode(200) setPreferences(@Body() b: unknown) { return this.svc.setPreferences(b); }
  @Post('push-devices') @HttpCode(200) registerDevice(@Body() b: unknown) { return this.svc.registerDevice(b); }
  @Post('push-devices/revoke') @HttpCode(200) revokeDevice(@Body() b: unknown) { return this.svc.revokeDevice(b); }
  @Post('read-all') @HttpCode(200) readAll() { return this.svc.readAll(); }
  @Post(':id/read') @HttpCode(200) read(@Param() p: unknown) { return this.svc.read(idParam.parse(p).id); }
}

@Controller('company/messages')
class MessageLogController {
  constructor(private readonly svc: NotificationsService) {}
  @Get() list(@Query() q: Record<string, unknown>) { return this.svc.messageLog(q); }
}

@Module({ controllers: [NotificationsController, MessageLogController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
