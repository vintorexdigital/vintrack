import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { inviteUserBody, updateMembershipBody, companyProfileBody, SYSTEM_ROLES } from '@trackrex/schemas';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../core/config.js';
import { Db } from '../../core/database/db.service.js';
import { sha256 } from '../../core/auth/password.js';
import { invitations, memberships, ownershipTransfers, supportSessions, tenants, users, platformUsers, platformAuditLog } from '../../core/auth/platform.tables.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { AuditService } from '../../core/audit.service.js';
import { conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Authz, RbacService } from '../../core/rbac.service.js';
import { MESSAGING, type MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';

const SYSTEM_KEYS = new Set(SYSTEM_ROLES.map((r) => r.key));

@Injectable()
export class CompanyService {
  constructor(
    private readonly db: Db, private readonly authz: Authz, private readonly audit: AuditService, private readonly dir: TenantDirectory,
    private readonly rbac: RbacService, @Inject(CONFIG) private readonly cfg: Config, @Inject(MESSAGING) private readonly messaging: MessagingProvider,
  ) {}

  private get tenantId(): string {
    return currentStore().tenantId!;
  }

  /** Owner can never be granted through invitations or role edits; only through an accepted transfer. */
  private assertGrantable(roleKeys: string[]): void {
    for (const k of roleKeys) {
      if (k === 'owner') throw forbidden('Ownership can only be moved with an ownership transfer.', 'owner_not_grantable');
    }
  }

  async profile() {
    const t = await this.dir.tenant(this.tenantId);
    if (!t) throw notFound('Company');
    return { id: t.id, slug: t.slug, name: t.name, legalName: t.legalName, country: t.country, timezone: t.timezone, currency: t.currency, locale: t.locale, plan: t.planKey, status: t.status, trialEndsAt: t.trialEndsAt, supportAccessEnabled: t.supportAccessEnabled };
  }

  async updateProfile(body: unknown) {
    this.authz.require('company.settings.update');
    const b = companyProfileBody.parse(body);
    const [before] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    await this.db.app.update(tenants).set({ ...b, updatedAt: sql`now()` }).where(eq(tenants.id, this.tenantId));
    this.dir.invalidate(this.tenantId);
    await this.audit.record({ entity: 'company', entityId: this.tenantId, action: 'updated', changes: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { old: (before as Record<string, unknown>)[k], new: v }])) });
    return this.profile();
  }

  /* ---------- support access ---------- */

  async setSupportAccess(enabled: boolean) {
    this.authz.require('company.support.manage');
    await this.db.app.update(tenants).set({ supportAccessEnabled: enabled, updatedAt: sql`now()` }).where(eq(tenants.id, this.tenantId));
    if (!enabled) {
      await this.db.app.update(supportSessions).set({ endedAt: sql`now()`, endedReason: 'access revoked by company' }).where(and(eq(supportSessions.tenantId, this.tenantId), sql`${supportSessions.endedAt} is null`));
    }
    this.dir.invalidate(this.tenantId);
    await this.audit.record({ entity: 'company', entityId: this.tenantId, action: enabled ? 'support_access_enabled' : 'support_access_disabled' });
    return { supportAccessEnabled: enabled };
  }

  /** Companies always see who looked at their account and why. */
  async supportSessions() {
    this.authz.require('company.support.manage');
    return this.db.app.select({ id: supportSessions.id, staffName: platformUsers.name, reason: supportSessions.reason, startedAt: supportSessions.startedAt, expiresAt: supportSessions.expiresAt, endedAt: supportSessions.endedAt })
      .from(supportSessions).innerJoin(platformUsers, eq(platformUsers.id, supportSessions.staffId)).where(eq(supportSessions.tenantId, this.tenantId)).orderBy(desc(supportSessions.startedAt)).limit(50);
  }

  async activeSupportSession() {
    const [s] = await this.db.app.select({ id: supportSessions.id, staffName: platformUsers.name, reason: supportSessions.reason, expiresAt: supportSessions.expiresAt })
      .from(supportSessions).innerJoin(platformUsers, eq(platformUsers.id, supportSessions.staffId))
      .where(and(eq(supportSessions.tenantId, this.tenantId), sql`${supportSessions.endedAt} is null`, sql`${supportSessions.expiresAt} > now()`)).limit(1);
    return s ?? null;
  }

  /* ---------- users and invitations ---------- */

  async invite(body: unknown) {
    this.authz.require('company.users.invite');
    const b = inviteUserBody.parse(body) as z.infer<typeof inviteUserBody>;
    this.assertGrantable(b.roleKeys);
    const token = randomBytes(24).toString('base64url');
    const auth = currentAuth();
    const [row] = await this.db.app.insert(invitations).values({
      tenantId: this.tenantId, email: b.email ?? null, mobile: b.mobile ?? null, name: b.name ?? null, roleKeys: b.roleKeys,
      employeeId: b.employeeId ?? null, tokenHash: sha256(token), invitedBy: auth.membershipId ?? null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).returning();
    const link = `${this.cfg.WEB_ORIGIN}/accept-invite?token=${token}`;
    const tenant = await this.dir.tenant(this.tenantId);
    await this.messaging.send({
      channel: b.email ? 'email' : 'sms', to: (b.email ?? b.mobile)!, template: 'user-invite', subject: `You are invited to ${tenant?.name} on Trackrex`,
      body: `Open ${link} to join ${tenant?.name}. The link works for 7 days.`, vars: { link },
    });
    await this.audit.record({ entity: 'invitations', entityId: row!.id, action: 'created', changes: { to: { new: b.email ?? b.mobile }, roleKeys: { new: b.roleKeys } } });
    return { id: row!.id, expiresAt: row!.expiresAt, ...(this.cfg.AUTH_DEV_OTP_ECHO ? { devToken: token } : {}) };
  }

  async listInvitations() {
    this.authz.require('company.users.read');
    return this.db.app.select({ id: invitations.id, email: invitations.email, mobile: invitations.mobile, name: invitations.name, roleKeys: invitations.roleKeys, status: invitations.status, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations).where(eq(invitations.tenantId, this.tenantId)).orderBy(desc(invitations.createdAt)).limit(200);
  }

  async revokeInvitation(id: string) {
    this.authz.require('company.users.invite');
    const rows = await this.db.app.update(invitations).set({ status: 'revoked' }).where(and(eq(invitations.id, id), eq(invitations.tenantId, this.tenantId), eq(invitations.status, 'pending'))).returning({ id: invitations.id });
    if (!rows.length) throw notFound('Invitation');
    await this.audit.record({ entity: 'invitations', entityId: id, action: 'revoked' });
  }

  async members() {
    this.authz.require('company.users.read');
    return this.db.app.select({ id: memberships.id, userId: users.id, name: users.name, email: users.email, mobile: users.mobile, roleKeys: memberships.roleKeys, status: memberships.status, isOwner: memberships.isOwner, employeeId: memberships.employeeId, lastLoginAt: users.lastLoginAt })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.tenantId, this.tenantId), inArray(memberships.status, ['active', 'suspended', 'invited']))).orderBy(users.name);
  }

  async updateMember(id: string, body: unknown) {
    this.authz.require('company.users.invite');
    const b = updateMembershipBody.parse(body);
    const [m] = await this.db.app.select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.tenantId, this.tenantId)));
    if (!m) throw notFound('User');
    if (m.isOwner) throw forbidden('The owner cannot be changed here. Transfer ownership first.', 'owner_protected');
    if (b.roleKeys) this.assertGrantable(b.roleKeys);
    const next = { ...(b.roleKeys ? { roleKeys: b.roleKeys } : {}), ...(b.status ? { status: b.status } : {}), updatedAt: sql`now()` };
    await this.db.app.update(memberships).set(next).where(eq(memberships.id, id));
    this.dir.invalidate(this.tenantId);
    this.rbac.invalidate(this.tenantId);
    await this.audit.record({ entity: 'memberships', entityId: id, action: 'updated', changes: { ...(b.roleKeys ? { roleKeys: { old: m.roleKeys, new: b.roleKeys } } : {}), ...(b.status ? { status: { old: m.status, new: b.status } } : {}) } });
    return { id };
  }

  /* ---------- ownership transfer: needs the new owner's acceptance ---------- */

  async startOwnershipTransfer(toMembershipId: string) {
    const auth = currentAuth();
    if (!auth.isOwner) throw forbidden('Only the owner can transfer ownership.', 'owner_only');
    const [to] = await this.db.app.select().from(memberships).where(and(eq(memberships.id, toMembershipId), eq(memberships.tenantId, this.tenantId), eq(memberships.status, 'active')));
    if (!to || to.id === auth.membershipId) throw unprocessable('Choose another active user.');
    const [pending] = await this.db.app.select().from(ownershipTransfers).where(and(eq(ownershipTransfers.tenantId, this.tenantId), eq(ownershipTransfers.status, 'pending')));
    if (pending) throw conflict('transfer_pending', 'An ownership transfer is already waiting for a response.');
    const [row] = await this.db.app.insert(ownershipTransfers).values({ tenantId: this.tenantId, fromMembershipId: auth.membershipId!, toMembershipId, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }).returning();
    await this.audit.record({ entity: 'company', entityId: this.tenantId, action: 'ownership_transfer_started', changes: { to: { new: toMembershipId } } });
    return { id: row!.id };
  }

  async resolveOwnershipTransfer(id: string, accept: boolean) {
    const auth = currentAuth();
    const [t] = await this.db.app.select().from(ownershipTransfers).where(and(eq(ownershipTransfers.id, id), eq(ownershipTransfers.tenantId, this.tenantId), eq(ownershipTransfers.status, 'pending')));
    if (!t || new Date(t.expiresAt).getTime() < Date.now()) throw notFound('Ownership transfer');
    const isRecipient = t.toMembershipId === auth.membershipId;
    const isSender = t.fromMembershipId === auth.membershipId;
    if (accept && !isRecipient) throw forbidden('Only the new owner can accept.', 'recipient_only');
    if (!accept && !isRecipient && !isSender) throw forbidden('You are not part of this transfer.');
    await this.db.app.transaction(async (tx) => {
      if (accept) {
        await tx.update(memberships).set({ isOwner: false, roleKeys: sql`array_remove(${memberships.roleKeys}, 'owner') || array['admin']::text[]` }).where(eq(memberships.id, t.fromMembershipId));
        await tx.update(memberships).set({ isOwner: true, roleKeys: sql`array(select distinct unnest(${memberships.roleKeys} || array['owner']::text[]))` }).where(eq(memberships.id, t.toMembershipId));
        await tx.update(tenants).set({ ownerMembershipId: t.toMembershipId }).where(eq(tenants.id, this.tenantId));
      }
      await tx.update(ownershipTransfers).set({ status: accept ? 'accepted' : auth.membershipId === t.fromMembershipId ? 'cancelled' : 'declined', resolvedAt: sql`now()` }).where(eq(ownershipTransfers.id, id));
      await tx.insert(platformAuditLog).values({ actorId: auth.userId, actorType: 'user', tenantId: this.tenantId, action: accept ? 'ownership.transferred' : 'ownership.transfer_declined', entity: 'tenant', entityId: this.tenantId });
    });
    this.dir.invalidate(this.tenantId);
    this.rbac.invalidate(this.tenantId);
    await this.audit.record({ entity: 'company', entityId: this.tenantId, action: accept ? 'ownership_transferred' : 'ownership_transfer_declined' });
    return { status: accept ? 'accepted' : 'declined' };
  }

  roleCatalogue() {
    return SYSTEM_ROLES.map((r) => ({ key: r.key, name: r.name, description: r.description })).filter((r) => r.key !== 'owner');
  }
}

export { SYSTEM_KEYS };
