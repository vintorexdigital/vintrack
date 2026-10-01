import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Source } from '@trackrex/schemas';
import { CONFIG, type Config } from '../../core/config.js';
import { Db } from '../../core/database/db.service.js';
import { hashPassword, passwordProblems, sha256, verifyPassword } from '../../core/auth/password.js';
import { invitations, memberships, tenants, userIdentities, users } from '../../core/auth/platform.tables.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { TokensService } from '../../core/auth/tokens.service.js';
import { AppError, forbidden, notFound, unauthorized, unprocessable } from '../../core/errors.js';
import { RbacService } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { OidcService, type OidcProvider } from './oidc.service.js';
import { OtpService, normalizeIdentifier } from './otp.service.js';

type UserRow = typeof users.$inferSelect;
type TenantRowT = typeof tenants.$inferSelect;
type MembershipRowT = typeof memberships.$inferSelect;

export interface ClientInfo {
  source: Source;
  ip?: string | undefined;
  userAgent?: string | undefined;
  deviceId?: string | undefined;
}

export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export type SignInResult =
  | {
      status: 'ok';
      accessToken: string;
      expiresIn: number;
      refreshToken: string;
      user: { id: string; name: string; email: string | null; mobile: string | null };
      company: CompanySummary;
      membership: { id: string; roleKeys: string[]; isOwner: boolean; employeeId: string | null };
    }
  | { status: 'choose_company'; selectionToken: string; companies: CompanySummary[] };

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const LIVE_TENANT = ['trial', 'active', 'past_due', 'suspended'];

export const AUTH_METHODS = ['password', 'mobile_otp', 'email_otp', 'google', 'microsoft'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly tokens: TokensService,
    private readonly otp: OtpService,
    private readonly oidc: OidcService,
    private readonly dir: TenantDirectory,
    private readonly rbac: RbacService,
    private readonly settings: SettingsService,
    private readonly entitlements: EntitlementsService,
    @Inject(CONFIG) private readonly cfg: Config,
  ) {}

  /* ---------- lookups ---------- */

  private async findUser(identifier: string): Promise<UserRow | undefined> {
    const { kind, value } = normalizeIdentifier(identifier);
    const [u] = await this.db.app.select().from(users).where(kind === 'email' ? sql`lower(${users.email}) = ${value}` : eq(users.mobile, value)).limit(1);
    return u;
  }

  private async companiesFor(userId: string): Promise<{ m: MembershipRowT; t: TenantRowT }[]> {
    const rows = await this.db.app.select({ m: memberships, t: tenants }).from(memberships).innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), inArray(tenants.status, LIVE_TENANT)));
    return rows;
  }

  private summary(t: TenantRowT): CompanySummary {
    return { id: t.id, slug: t.slug, name: t.name, status: t.status };
  }

  /** Is a sign-in method enabled for this company? Defaults: everything but SSO providers off until configured. */
  private async methodAllowed(tenantId: string, method: AuthMethod): Promise<boolean> {
    const enabled = await this.db.runAsTenant(tenantId, {}, () => this.settings.get<Record<string, boolean>>('auth.methods', { password: true, mobile_otp: true, email_otp: true, google: true, microsoft: true }));
    return enabled[method] !== false;
  }

  /* ---------- sign-in ---------- */

  async loginWithPassword(identifier: string, password: string, tenantHint: string | undefined, client: ClientInfo): Promise<SignInResult> {
    const user = await this.findUser(identifier);
    if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new AppError(423, 'account_locked', `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`);
    }
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok || user.status !== 'active') {
      if (user) {
        await this.db.app.update(users).set({
          failedLogins: sql`${users.failedLogins} + 1`,
          lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${LOCK_AFTER} then now() + make_interval(mins => ${LOCK_MINUTES}) else ${users.lockedUntil} end`,
        }).where(eq(users.id, user.id));
      }
      throw unauthorized('The email, mobile number or password is not right.', 'invalid_credentials');
    }
    await this.db.app.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
    return this.continueSignIn(user, tenantHint, client, 'password');
  }

  async requestOtp(identifier: string, ip?: string): Promise<{ sent: true; devCode?: string }> {
    const user = await this.findUser(identifier);
    const res = await this.otp.issue(identifier, !!user && user.status === 'active', ip);
    return { sent: true, ...res };
  }

  async verifyOtp(identifier: string, code: string, tenantHint: string | undefined, client: ClientInfo): Promise<SignInResult> {
    await this.otp.verify(identifier, code);
    const user = await this.findUser(identifier);
    if (!user || user.status !== 'active') throw unauthorized('That code is not valid. Request a new one.', 'otp_invalid');
    const { kind } = normalizeIdentifier(identifier);
    await this.db.app.update(users).set({ lastLoginAt: sql`now()`, ...(kind === 'email' ? { emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` } : { mobileVerifiedAt: sql`coalesce(${users.mobileVerifiedAt}, now())` }) }).where(eq(users.id, user.id));
    return this.continueSignIn(user, tenantHint, client, kind === 'email' ? 'email_otp' : 'mobile_otp');
  }

  async loginWithOidc(provider: OidcProvider, idToken: string, tenantHint: string | undefined, client: ClientInfo): Promise<SignInResult> {
    const id = await this.oidc.verify(provider, idToken);
    let [link] = await this.db.app.select().from(userIdentities).where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, id.subject))).limit(1);
    let user: UserRow | undefined;
    if (link) {
      [user] = await this.db.app.select().from(users).where(eq(users.id, link.userId)).limit(1);
    } else if (id.email && id.emailVerified) {
      user = await this.findUser(id.email);
      if (user) {
        [link] = await this.db.app.insert(userIdentities).values({ userId: user.id, provider, subject: id.subject }).returning();
      }
    }
    if (!user || user.status !== 'active') throw forbidden('No Trackrex account matches that sign-in. Ask your admin to invite you.', 'no_account');
    await this.db.app.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
    return this.continueSignIn(user, tenantHint, client, provider);
  }

  private async continueSignIn(user: UserRow, tenantHint: string | undefined, client: ClientInfo, method: AuthMethod): Promise<SignInResult> {
    const companies = await this.companiesFor(user.id);
    if (!companies.length) throw forbidden('Your account is not linked to an active company.', 'no_company');
    let pick: { m: MembershipRowT; t: TenantRowT } | undefined;
    if (tenantHint) {
      pick = companies.find((c) => c.t.slug.toLowerCase() === tenantHint.toLowerCase() || c.t.id === tenantHint);
      if (!pick) throw forbidden('You do not have access to that company.', 'no_access');
    } else if (companies.length === 1) {
      pick = companies[0];
    }
    if (!pick) {
      return { status: 'choose_company', selectionToken: await this.tokens.signSelection(user.id), companies: companies.map((c) => this.summary(c.t)) };
    }
    if (!(await this.methodAllowed(pick.t.id, method))) {
      throw forbidden('This company has turned off that sign-in method.', 'method_disabled');
    }
    return this.issueSession(user, pick.m, pick.t, client);
  }

  async selectCompany(selectionToken: string, tenantId: string, client: ClientInfo): Promise<SignInResult> {
    const userId = await this.tokens.verifySelection(selectionToken);
    const [user] = await this.db.app.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== 'active') throw unauthorized();
    const pick = (await this.companiesFor(userId)).find((c) => c.t.id === tenantId);
    if (!pick) throw forbidden('You do not have access to that company.', 'no_access');
    return this.issueSession(user, pick.m, pick.t, client);
  }

  async switchCompany(userId: string, tenantId: string, client: ClientInfo): Promise<SignInResult> {
    const [user] = await this.db.app.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw unauthorized();
    const pick = (await this.companiesFor(userId)).find((c) => c.t.id === tenantId);
    if (!pick) throw forbidden('You do not have access to that company.', 'no_access');
    return this.issueSession(user, pick.m, pick.t, client);
  }

  private async issueSession(user: UserRow, m: MembershipRowT, t: TenantRowT, client: ClientInfo, familyId?: string): Promise<Extract<SignInResult, { status: 'ok' }>> {
    const accessToken = await this.tokens.signCompany({ sub: user.id, tid: t.id, mid: m.id, eid: m.employeeId, rk: m.roleKeys, src: client.source, own: m.isOwner });
    const refreshToken = await this.tokens.issueRefresh({
      realm: 'company', userId: user.id, tenantId: t.id, membershipId: m.id,
      ...(familyId ? { familyId } : {}), ...(client.deviceId ? { deviceId: client.deviceId } : {}),
      ...(client.userAgent ? { userAgent: client.userAgent } : {}), ...(client.ip ? { ip: client.ip } : {}),
      ...(client.source === 'mobile' || client.source === 'desktop' ? { ttlDays: 90 } : {}),
    });
    return {
      status: 'ok', accessToken, expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS, refreshToken,
      user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile },
      company: this.summary(t), membership: { id: m.id, roleKeys: m.roleKeys, isOwner: m.isOwner, employeeId: m.employeeId },
    };
  }

  async refresh(token: string, client: ClientInfo): Promise<Extract<SignInResult, { status: 'ok' }>> {
    const row = await this.tokens.consumeRefresh(token, 'company');
    if (!row.userId || !row.membershipId || !row.tenantId) throw unauthorized();
    const [found] = await this.db.app.select({ m: memberships, t: tenants, u: users }).from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId)).innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.id, row.membershipId)).limit(1);
    if (!found || found.m.status !== 'active' || found.u.status !== 'active' || !LIVE_TENANT.includes(found.t.status)) {
      await this.tokens.revokeFamily(row.familyId, 'company');
      throw unauthorized('Your access has ended. Sign in again.', 'membership_inactive');
    }
    return this.issueSession(found.u, found.m, found.t, { ...client, deviceId: row.deviceId ?? client.deviceId }, row.familyId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const [id] = refreshToken.split('.');
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const row = await this.tokens.consumeRefresh(refreshToken, 'company').catch(() => null);
    if (row) await this.tokens.revokeFamily(row.familyId, 'company');
  }

  /* ---------- invitations ---------- */

  async previewInvitation(token: string) {
    const [row] = await this.db.app.select({ i: invitations, t: tenants }).from(invitations).innerJoin(tenants, eq(tenants.id, invitations.tenantId)).where(eq(invitations.tokenHash, sha256(token))).limit(1);
    if (!row || row.i.status !== 'pending' || new Date(row.i.expiresAt).getTime() < Date.now()) throw notFound('Invitation');
    const existing = row.i.email ? await this.findUser(row.i.email) : row.i.mobile ? await this.findUser(row.i.mobile) : undefined;
    return { company: { name: row.t.name, slug: row.t.slug }, email: row.i.email, mobile: row.i.mobile, name: row.i.name, hasAccount: !!existing };
  }

  async acceptInvitation(input: { token: string; name: string; password: string; mobile?: string | undefined }, client: ClientInfo): Promise<SignInResult> {
    const [row] = await this.db.app.select({ i: invitations, t: tenants }).from(invitations).innerJoin(tenants, eq(tenants.id, invitations.tenantId)).where(eq(invitations.tokenHash, sha256(input.token))).limit(1);
    if (!row || row.i.status !== 'pending' || new Date(row.i.expiresAt).getTime() < Date.now()) throw notFound('Invitation');
    const inv = row.i;
    let user = inv.email ? await this.findUser(inv.email) : inv.mobile ? await this.findUser(inv.mobile) : undefined;
    if (user) {
      if (!(await verifyPassword(input.password, user.passwordHash))) throw unauthorized('Enter the password of your existing Trackrex account to accept.', 'invalid_credentials');
    } else {
      const problems = passwordProblems(input.password);
      if (problems.length) throw unprocessable(problems.join(' '), [{ path: 'password', message: problems.join(' ') }]);
      [user] = await this.db.app.insert(users).values({
        email: inv.email, mobile: inv.mobile ?? input.mobile ?? null, name: input.name, passwordHash: await hashPassword(input.password),
        emailVerifiedAt: inv.email ? sql`now()` : null,
      }).returning();
    }
    const [existingM] = await this.db.app.select().from(memberships).where(and(eq(memberships.userId, user!.id), eq(memberships.tenantId, inv.tenantId))).limit(1);
    let m: MembershipRowT;
    if (existingM) {
      [m] = await this.db.app.update(memberships).set({ status: 'active', roleKeys: inv.roleKeys, employeeId: inv.employeeId ?? existingM.employeeId, updatedAt: sql`now()` }).where(eq(memberships.id, existingM.id)).returning() as [MembershipRowT];
    } else {
      [m] = await this.db.app.insert(memberships).values({ userId: user!.id, tenantId: inv.tenantId, roleKeys: inv.roleKeys, employeeId: inv.employeeId, status: 'active' }).returning() as [MembershipRowT];
    }
    await this.db.app.update(invitations).set({ status: 'accepted', acceptedAt: sql`now()` }).where(eq(invitations.id, inv.id));
    this.dir.invalidate(inv.tenantId);
    this.rbac.invalidate(inv.tenantId);
    return this.issueSession(user!, m, row.t, client);
  }

  /* ---------- me ---------- */

  async me(auth: { userId: string; tenantId: string; membershipId: string; permissions: Map<string, string>; employeeId?: string | null; roleKeys: string[]; isOwner?: boolean; support?: { sessionId: string } }) {
    const [user] = await this.db.app.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    const tenant = await this.dir.tenant(auth.tenantId);
    if (!tenant) throw unauthorized();
    const companies = user ? (await this.companiesFor(user.id)).map((c) => this.summary(c.t)) : [];
    return {
      user: user ? { id: user.id, name: user.name, email: user.email, mobile: user.mobile, locale: user.locale } : null,
      company: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status, plan: tenant.planKey, timezone: tenant.timezone, currency: tenant.currency, locale: tenant.locale, country: tenant.country, trialEndsAt: tenant.trialEndsAt, supportAccessEnabled: tenant.supportAccessEnabled },
      membership: { id: auth.membershipId, roleKeys: auth.roleKeys, isOwner: !!auth.isOwner, employeeId: auth.employeeId ?? null },
      permissions: [...auth.permissions].map(([permission, scope]) => ({ permission, scope })),
      modules: this.entitlements.modules(tenant),
      companies,
      ...(auth.support ? { support: { sessionId: auth.support.sessionId } } : {}),
    };
  }
}
