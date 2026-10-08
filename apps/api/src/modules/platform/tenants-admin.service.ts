import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, lt, sql, gt } from 'drizzle-orm';
import { resellerBody, lifecycleBody, provisionBody, supportSessionBody, updateTenantBody, type TenantStatus } from '@trackrex/schemas';
import { z } from 'zod';
import { Db } from '../../core/database/db.service.js';
import { memberships, platformAuditLog, supportSessions, tenants, tenantUsage, users, resellers, companyGroups } from '../../core/auth/platform.tables.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { TokensService } from '../../core/auth/tokens.service.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { conflict, forbidden, mapDatabaseError, notFound, unprocessable } from '../../core/errors.js';
import { ProvisioningService } from '../accounts/provisioning.service.js';
import { CONFIG, type Config } from '../../core/config.js';

const TRANSITIONS: Record<string, { from: TenantStatus[]; to: TenantStatus }> = {
  suspend: { from: ['trial', 'active', 'past_due'], to: 'suspended' },
  restore: { from: ['suspended'], to: 'active' },
  cancel: { from: ['trial', 'active', 'past_due', 'suspended'], to: 'cancelled' },
  activate: { from: ['trial', 'past_due', 'cancelled'], to: 'active' },
  mark_past_due: { from: ['active'], to: 'past_due' },
  delete: { from: ['trial', 'active', 'past_due', 'suspended', 'cancelled'], to: 'deleted' },
  undelete: { from: ['deleted'], to: 'suspended' },
};

@Injectable()
export class TenantsAdminService {
  constructor(
    private readonly db: Db, private readonly provisioning: ProvisioningService, private readonly dir: TenantDirectory,
    private readonly tokens: TokensService, @Inject(CONFIG) private readonly cfg: Config,
  ) {}

  private async log(action: string, tenantId: string | null, details: Record<string, unknown> = {}, entityId?: string) {
    const s = currentStore();
    await this.db.platform.insert(platformAuditLog).values({
      actorId: currentAuth().userId, actorType: 'platform_user', tenantId, action, entity: 'tenant', entityId: entityId ?? tenantId, details, ip: s.ip ?? null, requestId: s.requestId,
    });
  }

  async list(q: { status?: string; q?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(Number(q.limit ?? 25), 100);
    const where = and(
      q.status ? inArray(tenants.status, q.status.split(',')) : undefined,
      q.q ? ilike(tenants.name, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
      q.cursor ? lt(tenants.createdAt, Buffer.from(q.cursor, 'base64url').toString()) : undefined,
    );
    const rows = await this.db.platform.select({ t: tenants, u: tenantUsage }).from(tenants).leftJoin(tenantUsage, eq(tenantUsage.tenantId, tenants.id)).where(where).orderBy(desc(tenants.createdAt)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const [{ n } = { n: 0 }] = await this.db.platform.select({ n: sql<number>`count(*)::int` }).from(tenants).where(q.status ? inArray(tenants.status, q.status.split(',')) : undefined);
    return {
      data: page.map(({ t, u }) => ({ id: t.id, slug: t.slug, name: t.name, status: t.status, plan: t.planKey, country: t.country, seatLimit: t.seatLimit, employeesActive: u?.employeesActive ?? 0, trialEndsAt: t.trialEndsAt, isDemo: t.isDemo, supportAccessEnabled: t.supportAccessEnabled, createdAt: t.createdAt })),
      nextCursor: rows.length > limit ? Buffer.from(page[page.length - 1]!.t.createdAt).toString('base64url') : null,
      total: n,
    };
  }

  async get(id: string) {
    const [row] = await this.db.platform.select({ t: tenants, u: tenantUsage }).from(tenants).leftJoin(tenantUsage, eq(tenantUsage.tenantId, tenants.id)).where(eq(tenants.id, id));
    if (!row) throw notFound('Company');
    const [owner] = row.t.ownerMembershipId
      ? await this.db.platform.select({ name: users.name, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, row.t.ownerMembershipId))
      : [];
    const sessions = await this.db.platform.select().from(supportSessions).where(eq(supportSessions.tenantId, id)).orderBy(desc(supportSessions.startedAt)).limit(20);
    const audit = await this.db.platform.select().from(platformAuditLog).where(eq(platformAuditLog.tenantId, id)).orderBy(desc(platformAuditLog.at)).limit(50);
    return { ...row.t, usage: row.u, owner: owner ?? null, supportSessions: sessions, audit };
  }

  async create(body: unknown) {
    const input = provisionBody.parse(body);
    const s = currentStore();
    const out = await this.provisioning.provision(input, { type: 'platform_user', id: currentAuth().userId, ip: s.ip, requestId: s.requestId });
    return { tenant: out.tenant, owner: { id: out.owner.id, email: out.owner.email }, ...('devInviteToken' in out ? { devInviteToken: out.devInviteToken } : {}) };
  }

  async update(id: string, body: unknown) {
    const b = updateTenantBody.parse(body) as z.infer<typeof updateTenantBody>;
    const [before] = await this.db.platform.select().from(tenants).where(eq(tenants.id, id));
    if (!before) throw notFound('Company');
    await this.db.platform.update(tenants).set({ ...b, updatedAt: sql`now()` } as never).where(eq(tenants.id, id));
    this.dir.invalidate(id);
    await this.log('tenant.updated', id, { changes: b });
    return this.get(id);
  }

  async lifecycle(id: string, body: unknown) {
    const b = lifecycleBody.parse(body);
    const [t] = await this.db.platform.select().from(tenants).where(eq(tenants.id, id));
    if (!t) throw notFound('Company');
    if (b.action === 'extend_trial') {
      if (t.status !== 'trial') throw conflict('not_in_trial', 'Only companies in a trial can have it extended.');
      const base = Math.max(Date.now(), t.trialEndsAt ? new Date(t.trialEndsAt).getTime() : 0);
      await this.db.platform.update(tenants).set({ trialEndsAt: new Date(base + (b.days ?? 7) * 86_400_000).toISOString(), updatedAt: sql`now()` }).where(eq(tenants.id, id));
    } else {
      const rule = TRANSITIONS[b.action]!;
      if (!rule.from.includes(t.status as TenantStatus)) throw conflict('invalid_transition', `A company that is ${t.status.replace('_', ' ')} cannot be ${b.action.replace('_', ' ')}d.`);
      if ((b.action === 'suspend' || b.action === 'delete') && !b.reason) throw unprocessable('Give a reason for this action.', [{ path: 'reason', message: 'Required' }]);
      const patch: Record<string, unknown> = { status: rule.to, updatedAt: sql`now()` };
      if (b.action === 'suspend') Object.assign(patch, { suspendedAt: sql`now()`, suspendedReason: b.reason });
      if (b.action === 'restore' || b.action === 'activate') Object.assign(patch, { suspendedAt: null, suspendedReason: null, pastDueSince: null, planKey: t.planKey === 'trial' && b.action === 'activate' ? 'all_in_one' : t.planKey });
      if (b.action === 'mark_past_due') patch.pastDueSince = sql`now()`;
      if (b.action === 'delete') Object.assign(patch, { deletedAt: sql`now()`, purgeAfter: sql`now() + interval '30 days'` });
      if (b.action === 'undelete') {
        if (t.purgeAfter && new Date(t.purgeAfter).getTime() < Date.now()) throw conflict('purge_window_passed', 'The 30-day recovery window has passed.');
        Object.assign(patch, { deletedAt: null, purgeAfter: null });
      }
      await this.db.platform.update(tenants).set(patch as never).where(eq(tenants.id, id));
      if (rule.to === 'suspended' || rule.to === 'deleted' || rule.to === 'cancelled') {
        await this.db.platform.update(supportSessions).set({ endedAt: sql`now()`, endedReason: `company ${rule.to}` }).where(and(eq(supportSessions.tenantId, id), isNull(supportSessions.endedAt)));
      }
    }
    this.dir.invalidate(id);
    await this.log(`tenant.${b.action}`, id, { reason: b.reason ?? null, days: b.days ?? null, from: t.status });
    return this.get(id);
  }

  /** Time-boxed, reasoned, audited access. Only possible when the company has switched support access on. */
  async startSupportSession(tenantId: string, body: unknown) {
    const b = supportSessionBody.parse(body);
    const [t] = await this.db.platform.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!t) throw notFound('Company');
    if (!t.supportAccessEnabled) throw forbidden('This company has not allowed support access.', 'support_access_not_allowed');
    if (t.status === 'deleted') throw conflict('tenant_deleted', 'This company is deleted.');
    const auth = currentAuth();
    const expires = new Date(Date.now() + b.minutes * 60_000);
    const [session] = await this.db.platform.insert(supportSessions).values({ tenantId, staffId: auth.userId, reason: b.reason, expiresAt: expires.toISOString() }).returning();
    const [m] = await this.db.platform.select().from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.isOwner, true))).limit(1);
    const accessToken = await this.tokens.signCompany({ sub: auth.userId, tid: tenantId, mid: m?.id ?? session!.id, rk: ['admin'], src: 'web', sup: { sid: session!.id, staff: auth.userId } }, Math.min(b.minutes * 60, 900));
    await this.log('support_session.started', tenantId, { reason: b.reason, minutes: b.minutes }, session!.id);
    return { session: session!, accessToken, consoleUrl: `${this.cfg.WEB_ORIGIN}/support#token=${accessToken}` };
  }

  async endSupportSession(id: string) {
    const rows = await this.db.platform.update(supportSessions).set({ endedAt: sql`now()`, endedReason: 'ended by staff' }).where(and(eq(supportSessions.id, id), isNull(supportSessions.endedAt))).returning();
    if (!rows.length) throw notFound('Support session');
    await this.log('support_session.ended', rows[0]!.tenantId, {}, id);
    return { ended: true };
  }

  async overview() {
    const byStatus = await this.db.platform.select({ status: tenants.status, n: sql<number>`count(*)::int` }).from(tenants).groupBy(tenants.status);
    const [seats] = await this.db.platform.select({ sold: sql<number>`coalesce(sum(${tenants.seatLimit}),0)::int`, used: sql<number>`coalesce(sum(${tenantUsage.employeesActive}),0)::int` })
      .from(tenants).leftJoin(tenantUsage, eq(tenantUsage.tenantId, tenants.id)).where(inArray(tenants.status, ['trial', 'active', 'past_due']));
    const trialsEnding = await this.db.platform.select({ id: tenants.id, name: tenants.name, trialEndsAt: tenants.trialEndsAt }).from(tenants)
      .where(and(eq(tenants.status, 'trial'), lt(tenants.trialEndsAt, new Date(Date.now() + 7 * 86_400_000).toISOString()), gt(tenants.trialEndsAt, new Date().toISOString()))).limit(20);
    const pastDue = await this.db.platform.select({ id: tenants.id, name: tenants.name, since: tenants.pastDueSince }).from(tenants).where(eq(tenants.status, 'past_due')).limit(20);
    const openSupport = await this.db.platform.select({ n: sql<number>`count(*)::int` }).from(supportSessions).where(and(isNull(supportSessions.endedAt), gt(supportSessions.expiresAt, new Date().toISOString())));
    return { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), seats: seats ?? { sold: 0, used: 0 }, trialsEnding, pastDue, openSupportSessions: openSupport[0]?.n ?? 0 };
  }

  async auditLog(q: { tenantId?: string; limit?: number }) {
    return this.db.platform.select().from(platformAuditLog).where(q.tenantId ? eq(platformAuditLog.tenantId, q.tenantId) : undefined).orderBy(desc(platformAuditLog.at)).limit(Math.min(Number(q.limit ?? 100), 500));
  }

  resellers() { return this.db.platform.select().from(resellers).orderBy(resellers.name); }

  async createReseller(body: unknown) {
    const b = resellerBody.parse(body);
    const [row] = await this.db.platform.insert(resellers).values({ name: b.name, slug: b.slug, contactEmail: b.contactEmail ?? null, marginPct: String(b.marginPct) }).returning().catch((e) => { throw mapDatabaseError(e) ?? e; });
    await this.log('reseller.created', null, { name: b.name, slug: b.slug }, row!.id);
    return row!;
  }

  async updateReseller(id: string, body: unknown) {
    const b = resellerBody.partial().extend({ marginPct: resellerBody.shape.marginPct.unwrap().optional(), status: z.enum(['active', 'suspended']).optional() }).parse(body);
    const [row] = await this.db.platform.update(resellers).set({ ...(b.name ? { name: b.name } : {}), ...(b.slug ? { slug: b.slug } : {}), ...(b.contactEmail !== undefined ? { contactEmail: b.contactEmail } : {}), ...(b.marginPct !== undefined ? { marginPct: String(b.marginPct) } : {}), ...(b.status ? { status: b.status } : {}), updatedAt: sql`now()` }).where(eq(resellers.id, id)).returning().catch((e) => { throw mapDatabaseError(e) ?? e; });
    if (!row) throw notFound('Reseller');
    await this.log('reseller.updated', null, b, id);
    return row;
  }

  async createGroup(body: unknown) {
    const b = z.object({ name: z.string().trim().min(2).max(120) }).parse(body);
    const [row] = await this.db.platform.insert(companyGroups).values({ name: b.name }).returning();
    await this.log('group.created', null, { name: b.name }, row!.id);
    return row!;
  }
  groups() { return this.db.platform.select().from(companyGroups).orderBy(companyGroups.name); }
}
