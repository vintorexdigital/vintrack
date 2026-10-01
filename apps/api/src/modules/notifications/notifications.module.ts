import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { idParam } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import type { OutboxHandler } from '../../jobs/outbox-relay.js';
import type { MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';

interface Rule {
  /** Who is told: a function of the event payload and the database. */
  recipients(db: Db, p: Record<string, unknown>, actorUserId: string | null): Promise<string[]>;
  title(who: string, p: Record<string, unknown>): string;
  body?(p: Record<string, unknown>): string | null;
  link: string;
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
    for (const userId of users) {
      await db.q.execute(sql`
        insert into notifications (tenant_id, user_id, type, title, body, link, event_id)
        values (${e.tenantId}::uuid, ${userId}::uuid, ${e.type}, ${rule.title(who, e.payload)}, ${rule.body?.(e.payload) ?? null}, ${rule.link}, ${e.id})
        on conflict do nothing`);
    }
    if (mail && users.length) await emailThem(db, mail, users, rule.title(who, e.payload), rule.body?.(e.payload) ?? null, rule.link);
  };
}

/** Email goes to people who have not opted out. A mail failure never blocks the event: the in-app notification is the record. */
async function emailThem(db: Db, mail: { messaging: MessagingProvider; origin: string }, userIds: string[], title: string, body: string | null, link: string): Promise<void> {
  const r = await db.q.execute(sql`
    select u.email from platform.users u left join notification_prefs p on p.user_id = u.id and p.tenant_id = app_tenant_id()
     where u.id = any(${sql.param(userIds)}::uuid[]) and u.email is not null and coalesce(p.email, true)`);
  for (const row of r.rows as { email: string }[]) {
    try {
      await mail.messaging.send({ channel: 'email', to: row.email, template: 'notification', subject: title, body: `${title}${body ? `\n${body}` : ''}\n\nOpen it: ${mail.origin}${link}` });
    } catch { /* logged by the provider */ }
  }
}

const listQuery = z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });

@Injectable()
export class NotificationsService {
  constructor(private readonly db: Db) {}

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
    const r = await this.db.q.execute(sql`select email from notification_prefs where user_id = ${currentAuth().userId}::uuid`);
    return { email: (r.rows[0] as { email: boolean } | undefined)?.email ?? true };
  }

  async setPreferences(raw: unknown) {
    const b = z.object({ email: z.boolean() }).parse(raw ?? {});
    await this.db.q.execute(sql`insert into notification_prefs (tenant_id, user_id, email) values (app_tenant_id(), ${currentAuth().userId}::uuid, ${b.email}) on conflict (tenant_id, user_id) do update set email = excluded.email, updated_at = now()`);
    return b;
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
  @Post('read-all') @HttpCode(200) readAll() { return this.svc.readAll(); }
  @Post(':id/read') @HttpCode(200) read(@Param() p: unknown) { return this.svc.read(idParam.parse(p).id); }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
