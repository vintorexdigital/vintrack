import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { CONFIG, type Config } from '../../core/config.js';
import { Db } from '../../core/database/db.service.js';
import { hmac } from '../../core/auth/password.js';
import { otpChallenges } from '../../core/auth/platform.tables.js';
import { tooMany, unauthorized } from '../../core/errors.js';
import { MESSAGING, type MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';

const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

export const normalizeIdentifier = (raw: string): { kind: 'email' | 'mobile'; value: string } => {
  const v = raw.trim();
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/[^\d+]/g, '');
  return { kind: 'mobile', value: digits.startsWith('+') ? digits : `+${digits}` };
};

@Injectable()
export class OtpService {
  /** Last code issued in dev echo mode, keyed by identifier. Never populated in production. */
  constructor(private readonly db: Db, @Inject(CONFIG) private readonly cfg: Config, @Inject(MESSAGING) private readonly messaging: MessagingProvider) {}

  private digest(identifier: string, code: string): string {
    return hmac(this.cfg.JWT_COMPANY_SECRET, `${identifier}:${code}`);
  }

  /** Always behaves the same whether or not the account exists, so identifiers cannot be probed. */
  async issue(identifier: string, accountExists: boolean, ip?: string): Promise<{ devCode?: string }> {
    const { kind, value } = normalizeIdentifier(identifier);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const [recent] = await this.db.app.select({ n: sql<number>`count(*)::int` }).from(otpChallenges).where(and(eq(otpChallenges.identifier, value), gt(otpChallenges.createdAt, since)));
    if ((recent?.n ?? 0) >= MAX_PER_HOUR) throw tooMany('Too many codes requested. Try again in an hour.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.app.insert(otpChallenges).values({
      identifier: value, codeHash: this.digest(value, code), expiresAt: new Date(Date.now() + TTL_MS).toISOString(), ip: ip ?? null,
    });
    if (accountExists) {
      await this.messaging.send({
        channel: kind === 'email' ? 'email' : 'sms', to: value, template: 'otp',
        subject: 'Your Trackrex sign-in code', body: `Your Trackrex code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this message.`,
        vars: { code },
      });
    }
    return this.cfg.AUTH_DEV_OTP_ECHO && accountExists ? { devCode: code } : {};
  }

  async verify(identifier: string, code: string): Promise<void> {
    const { value } = normalizeIdentifier(identifier);
    const [ch] = await this.db.app.select().from(otpChallenges)
      .where(and(eq(otpChallenges.identifier, value), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date().toISOString())))
      .orderBy(desc(otpChallenges.createdAt)).limit(1);
    if (!ch || ch.attempts >= MAX_ATTEMPTS) throw unauthorized('That code is not valid. Request a new one.', 'otp_invalid');
    await this.db.app.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, ch.id));
    if (ch.codeHash !== this.digest(value, code)) throw unauthorized('That code is not valid. Request a new one.', 'otp_invalid');
    const claimed = await this.db.app.update(otpChallenges).set({ consumedAt: sql`now()` }).where(and(eq(otpChallenges.id, ch.id), isNull(otpChallenges.consumedAt))).returning({ id: otpChallenges.id });
    if (!claimed.length) throw unauthorized('That code is not valid. Request a new one.', 'otp_invalid');
  }
}
