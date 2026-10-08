import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Db } from '../../core/database/db.service.js';
import { hashPassword, verifyPassword } from '../../core/auth/password.js';
import { platformAuditLog, platformUsers } from '../../core/auth/platform.tables.js';
import { ipAllowed } from '../../core/auth/ip.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../core/auth/totp.js';
import { TokensService } from '../../core/auth/tokens.service.js';
import { forbidden, unauthorized } from '../../core/errors.js';
import { Inject } from '@nestjs/common';
import { CONFIG, type Config } from '../../core/config.js';

export type PlatformSignIn =
  | { status: 'ok'; accessToken: string; expiresIn: number; refreshToken: string; user: { id: string; name: string; email: string; role: string } }
  | { status: 'totp_required' }
  | { status: 'totp_setup'; setupToken: string; secret: string; otpauthUri: string };

type PU = typeof platformUsers.$inferSelect;

@Injectable()
export class PlatformAuthService {
  constructor(private readonly db: Db, private readonly tokens: TokensService, @Inject(CONFIG) private readonly cfg: Config) {}

  private async audit(actorId: string | null, action: string, ip?: string, details: Record<string, unknown> = {}) {
    await this.db.platform.insert(platformAuditLog).values({ actorId, actorType: 'platform_user', action, details, ip: ip ?? null });
  }

  private async session(u: PU, ip?: string, ua?: string): Promise<PlatformSignIn> {
    await this.db.platform.update(platformUsers).set({ lastLoginAt: sql`now()` }).where(eq(platformUsers.id, u.id));
    await this.audit(u.id, 'platform.sign_in', ip);
    return {
      status: 'ok', accessToken: await this.tokens.signPlatform({ sub: u.id, role: u.role }), expiresIn: 900,
      refreshToken: await this.tokens.issueRefresh({ realm: 'platform', userId: u.id, ttlDays: 1, ...(ip ? { ip } : {}), ...(ua ? { userAgent: ua } : {}) }),
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    };
  }

  /** Staff always need a second factor: unenrolled accounts are walked through setup before getting tokens. */
  async login(email: string, password: string, totp: string | undefined, ip?: string, ua?: string): Promise<PlatformSignIn> {
    const [u] = await this.db.platform.select().from(platformUsers).where(sql`lower(${platformUsers.email}) = ${email}`).limit(1);
    const ok = await verifyPassword(password, u?.passwordHash);
    if (!u || !ok || u.status !== 'active') {
      await this.audit(u?.id ?? null, 'platform.sign_in_failed', ip, { email });
      throw unauthorized('The email or password is not right.', 'invalid_credentials');
    }
    if (!ipAllowed(ip, u.ipAllowlist, this.cfg.PLATFORM_ALLOW_ANY_IP_WHEN_EMPTY)) {
      await this.audit(u.id, 'platform.sign_in_blocked_ip', ip);
      throw forbidden('Sign-in from this network is not allowed.', 'ip_not_allowed');
    }
    if (!u.totpEnabled) {
      const secret = u.totpSecret ?? generateTotpSecret();
      if (!u.totpSecret) await this.db.platform.update(platformUsers).set({ totpSecret: secret }).where(eq(platformUsers.id, u.id));
      return { status: 'totp_setup', setupToken: await this.tokens.signPlatform({ sub: u.id, role: u.role, pending2fa: true }), secret, otpauthUri: otpauthUri(secret, u.email) };
    }
    if (!totp) return { status: 'totp_required' };
    if (!verifyTotp(u.totpSecret!, totp)) {
      await this.audit(u.id, 'platform.totp_failed', ip);
      throw unauthorized('That code is not right.', 'totp_invalid');
    }
    return this.session(u, ip, ua);
  }

  async enrollTotp(userId: string, code: string, ip?: string, ua?: string): Promise<PlatformSignIn> {
    const [u] = await this.db.platform.select().from(platformUsers).where(eq(platformUsers.id, userId)).limit(1);
    if (!u?.totpSecret || !verifyTotp(u.totpSecret, code)) throw unauthorized('That code is not right.', 'totp_invalid');
    await this.db.platform.update(platformUsers).set({ totpEnabled: true }).where(eq(platformUsers.id, userId));
    await this.audit(userId, 'platform.totp_enrolled', ip);
    return this.session({ ...u, totpEnabled: true }, ip, ua);
  }

  async refresh(token: string, ip?: string, ua?: string): Promise<PlatformSignIn> {
    const row = await this.tokens.consumeRefresh(token, 'platform');
    const [u] = await this.db.platform.select().from(platformUsers).where(eq(platformUsers.id, row.userId!)).limit(1);
    if (!u || u.status !== 'active' || !u.totpEnabled) throw unauthorized();
    if (!ipAllowed(ip, u.ipAllowlist, this.cfg.PLATFORM_ALLOW_ANY_IP_WHEN_EMPTY)) throw forbidden('Sign-in from this network is not allowed.', 'ip_not_allowed');
    return {
      status: 'ok', accessToken: await this.tokens.signPlatform({ sub: u.id, role: u.role }), expiresIn: 900,
      refreshToken: await this.tokens.issueRefresh({ realm: 'platform', userId: u.id, familyId: row.familyId, ttlDays: 1, ...(ip ? { ip } : {}), ...(ua ? { userAgent: ua } : {}) }),
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    };
  }

  async createStaff(input: { email: string; name: string; role: PU['role']; password: string; totpSecret?: string; ipAllowlist?: string[] }): Promise<PU> {
    const [u] = await this.db.platform.insert(platformUsers).values({
      email: input.email.toLowerCase(), name: input.name, role: input.role, passwordHash: await hashPassword(input.password),
      totpSecret: input.totpSecret ?? null, ipAllowlist: input.ipAllowlist ?? [],
    }).returning();
    return u!;
  }
}
