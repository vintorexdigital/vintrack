import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { ProvisionBody } from '@trackrex/schemas';
import { CONFIG, type Config } from '../../core/config.js';
import { Db } from '../../core/database/db.service.js';
import { hashPassword, passwordProblems, sha256 } from '../../core/auth/password.js';
import { invitations, memberships, platformAuditLog, tenants, tenantUsage, users } from '../../core/auth/platform.tables.js';
import { conflict, unprocessable } from '../../core/errors.js';
import { MESSAGING, type MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';

export type TenantSeeder = (ctx: { tenantId: string; country: string; timezone: string; currency: string; ownerUserId: string }) => Promise<void>;

export const SEQUENCE_DEFAULTS: { key: string; prefix: string }[] = [
  { key: 'employees', prefix: 'EMP' }, { key: 'customers', prefix: 'CUST' }, { key: 'tasks', prefix: 'TSK' },
  { key: 'expenses', prefix: 'EXP' }, { key: 'leave-requests', prefix: 'LV' }, { key: 'leads', prefix: 'LEAD' },
  { key: 'projects', prefix: 'PRJ' }, { key: 'cases', prefix: 'CASE' }, { key: 'assets', prefix: 'AST' },
];

@Injectable()
export class ProvisioningService {
  private readonly seeders: TenantSeeder[] = [];

  constructor(private readonly db: Db, @Inject(CONFIG) private readonly cfg: Config, @Inject(MESSAGING) private readonly messaging: MessagingProvider) {}

  /** Modules register what they need seeded for a new company (default leave types, holidays, shifts). */
  registerSeeder(seeder: TenantSeeder): void {
    this.seeders.push(seeder);
  }

  /**
   * One path for self-serve signup, master-admin creation and reseller creation: create the company,
   * reserve the subdomain, create or link the owner, then seed defaults inside the new tenant.
   */
  async provision(input: ProvisionBody, actor: { type: 'platform_user' | 'system' | 'user'; id?: string | null; ip?: string | undefined; requestId?: string | undefined }) {
    const problems = input.owner.password ? passwordProblems(input.owner.password) : [];
    if (problems.length) throw unprocessable(problems.join(' '), [{ path: 'owner.password', message: problems.join(' ') }]);
    const passwordHash = input.owner.password ? await hashPassword(input.owner.password) : null;

    const created = await this.db.app.transaction(async (tx) => {
      const [taken] = await tx.select({ id: tenants.id }).from(tenants).where(sql`lower(${tenants.slug}) = ${input.slug}`).limit(1);
      if (taken) throw conflict('slug_taken', 'That company address is already taken. Choose another.');
      const [tenant] = await tx.insert(tenants).values({
        slug: input.slug, name: input.name, legalName: input.legalName ?? null, country: input.country, timezone: input.timezone,
        currency: input.currency, locale: input.locale, planKey: input.planKey, status: input.planKey === 'trial' ? 'trial' : 'active',
        trialEndsAt: input.planKey === 'trial' ? new Date(Date.now() + input.trialDays * 86_400_000).toISOString() : null,
        seatLimit: input.seatLimit, isDemo: input.isDemo, resellerId: input.resellerId ?? null, groupId: input.groupId ?? null,
        createdBy: actor.id ?? null,
      }).returning();
      await tx.insert(tenantUsage).values({ tenantId: tenant!.id });

      let [user] = await tx.select().from(users).where(sql`lower(${users.email}) = ${input.owner.email}`).limit(1);
      let newUser = false;
      if (!user) {
        [user] = await tx.insert(users).values({ email: input.owner.email, mobile: input.owner.mobile ?? null, name: input.owner.name, passwordHash, locale: input.locale }).returning();
        newUser = true;
      }
      const [m] = await tx.insert(memberships).values({ userId: user!.id, tenantId: tenant!.id, roleKeys: ['owner'], isOwner: true, status: 'active' }).returning();
      await tx.update(tenants).set({ ownerMembershipId: m!.id }).where(eq(tenants.id, tenant!.id));

      let inviteToken: string | undefined;
      if (newUser && !passwordHash) {
        inviteToken = randomBytes(24).toString('base64url');
        await tx.insert(invitations).values({
          tenantId: tenant!.id, email: input.owner.email, name: input.owner.name, roleKeys: ['owner'], tokenHash: sha256(inviteToken),
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), invitedBy: null,
        });
      }
      await tx.insert(platformAuditLog).values({
        actorId: actor.id ?? null, actorType: actor.type, tenantId: tenant!.id, action: 'tenant.provisioned', entity: 'tenant', entityId: tenant!.id,
        details: { slug: input.slug, plan: input.planKey, owner: input.owner.email }, ip: actor.ip ?? null, requestId: actor.requestId ?? null,
      });
      return { tenant: tenant!, owner: user!, membership: m!, inviteToken };
    });

    await this.db.runAsTenant(created.tenant.id, { userId: created.owner.id }, async () => {
      await this.db.q.execute(sql`insert into sequences (tenant_id, key, prefix) select ${created.tenant.id}, k, p from jsonb_to_recordset(${JSON.stringify(SEQUENCE_DEFAULTS.map((s) => ({ k: s.key, p: s.prefix })))}::jsonb) as t(k text, p text) on conflict do nothing`);
      for (const seed of this.seeders) {
        await seed({ tenantId: created.tenant.id, country: input.country, timezone: input.timezone, currency: input.currency, ownerUserId: created.owner.id });
      }
    });

    if (created.inviteToken) {
      await this.messaging.send({
        channel: 'email', to: input.owner.email, template: 'owner-invite', subject: `Set up ${input.name} on Trackrex`,
        body: `Open ${this.cfg.WEB_ORIGIN}/accept-invite?token=${created.inviteToken} to set your password and finish setup.`,
        vars: { token: created.inviteToken },
      });
    }
    return { tenant: created.tenant, owner: created.owner, membership: created.membership, ...(this.cfg.AUTH_DEV_OTP_ECHO && created.inviteToken ? { devInviteToken: created.inviteToken } : {}) };
  }

  /** Subdomain and custom-domain lookups for tenant resolution. */
  async findBySlug(slug: string) {
    const [t] = await this.db.app.select().from(tenants).where(and(sql`lower(${tenants.slug}) = ${slug.toLowerCase()}`)).limit(1);
    return t ?? null;
  }
}

export const fingerprint = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12);
