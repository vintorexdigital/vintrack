import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../config.js';
import { Db } from '../database/db.service.js';
import { unauthorized } from '../errors.js';
import { randomToken, sha256 } from './password.js';
import { refreshTokens } from './platform.tables.js';
import type { Source } from '@trackrex/schemas';

export interface CompanyClaims {
  sub: string;
  tid: string;
  mid: string;
  eid?: string | null;
  rk: string[];
  src: Source;
  own?: boolean;
  sup?: { sid: string; staff: string };
}

export interface PlatformClaims {
  sub: string;
  role: string;
  /** Set until the second factor is verified; such tokens only reach the enrolment endpoints. */
  pending2fa?: boolean;
}

export const COMPANY_AUD = 'trackrex:company';
export const PLATFORM_AUD = 'trackrex:platform';
export const SELECT_AUD = 'trackrex:company-select';
const ISS = 'trackrex';

const key = (s: string) => new TextEncoder().encode(s);

@Injectable()
export class TokensService {
  constructor(@Inject(CONFIG) private readonly cfg: Config, private readonly db: Db) {}

  async signCompany(c: CompanyClaims, ttlSeconds = this.cfg.ACCESS_TOKEN_TTL_SECONDS): Promise<string> {
    return new SignJWT({ tid: c.tid, mid: c.mid, eid: c.eid ?? null, rk: c.rk, src: c.src, own: c.own ?? false, ...(c.sup ? { sup: c.sup } : {}) })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.sub).setIssuer(ISS).setAudience(COMPANY_AUD).setJti(randomUUID())
      .setIssuedAt().setExpirationTime(`${ttlSeconds}s`)
      .sign(key(this.cfg.JWT_COMPANY_SECRET));
  }

  async verifyCompany(token: string): Promise<CompanyClaims & { jti?: string }> {
    try {
      const { payload } = await jwtVerify(token, key(this.cfg.JWT_COMPANY_SECRET), { issuer: ISS, audience: COMPANY_AUD, algorithms: ['HS256'] });
      return { sub: payload.sub!, tid: payload.tid as string, mid: payload.mid as string, eid: (payload.eid as string | null) ?? null, rk: (payload.rk as string[]) ?? [], src: (payload.src as Source) ?? 'web', own: !!payload.own, ...(payload.sup ? { sup: payload.sup as { sid: string; staff: string } } : {}), ...(payload.jti ? { jti: payload.jti } : {}) };
    } catch {
      throw unauthorized('Your session has expired. Sign in again.', 'token_invalid');
    }
  }

  /** Short-lived proof of identity used to pick a company after sign-in. */
  async signSelection(userId: string): Promise<string> {
    return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer(ISS).setAudience(SELECT_AUD)
      .setIssuedAt().setExpirationTime('10m').sign(key(this.cfg.JWT_COMPANY_SECRET));
  }

  async verifySelection(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, key(this.cfg.JWT_COMPANY_SECRET), { issuer: ISS, audience: SELECT_AUD });
      return payload.sub!;
    } catch {
      throw unauthorized('That sign-in has expired. Start again.', 'selection_invalid');
    }
  }

  async signPlatform(c: PlatformClaims, ttlSeconds = 900): Promise<string> {
    return new SignJWT({ role: c.role, p2: c.pending2fa ?? false }).setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.sub).setIssuer(ISS).setAudience(PLATFORM_AUD).setJti(randomUUID())
      .setIssuedAt().setExpirationTime(`${c.pending2fa ? 600 : ttlSeconds}s`).sign(key(this.cfg.JWT_PLATFORM_SECRET));
  }

  async verifyPlatform(token: string): Promise<PlatformClaims> {
    try {
      const { payload } = await jwtVerify(token, key(this.cfg.JWT_PLATFORM_SECRET), { issuer: ISS, audience: PLATFORM_AUD, algorithms: ['HS256'] });
      return { sub: payload.sub!, role: payload.role as string, pending2fa: !!payload.p2 };
    } catch {
      throw unauthorized('Your platform session has expired. Sign in again.', 'token_invalid');
    }
  }

  /* ---------- refresh tokens: opaque, hashed at rest, rotated on every use ---------- */

  async issueRefresh(input: {
    realm: 'company' | 'platform';
    userId: string;
    tenantId?: string;
    membershipId?: string;
    familyId?: string;
    deviceId?: string;
    userAgent?: string;
    ip?: string;
    ttlDays?: number;
  }): Promise<string> {
    const id = randomUUID();
    const secret = randomToken(32);
    const ttl = input.ttlDays ?? this.cfg.REFRESH_TOKEN_TTL_DAYS;
    await this.db.app.insert(refreshTokens).values({
      id, realm: input.realm, userId: input.userId, tenantId: input.tenantId ?? null, membershipId: input.membershipId ?? null,
      familyId: input.familyId ?? randomUUID(), tokenHash: sha256(secret), expiresAt: new Date(Date.now() + ttl * 86_400_000).toISOString(),
      deviceId: input.deviceId ?? null, userAgent: input.userAgent ?? null, ip: input.ip ?? null,
    });
    return `${id}.${secret}`;
  }

  /** Rotate: mark the presented token used and return its context. Reuse revokes the whole family. */
  async consumeRefresh(token: string, realm: 'company' | 'platform') {
    const [id, secret] = token.split('.');
    if (!id || !secret || !/^[0-9a-f-]{36}$/.test(id)) throw unauthorized('Sign in again.', 'refresh_invalid');
    const db = realm === 'platform' ? this.db.platform : this.db.app;
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, id)).limit(1);
    if (!row || row.realm !== realm || row.tokenHash !== sha256(secret)) throw unauthorized('Sign in again.', 'refresh_invalid');
    if (row.revokedAt) throw unauthorized('Sign in again.', 'refresh_revoked');
    if (row.usedAt) {
      await db.update(refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      throw unauthorized('This session was used twice and has been closed. Sign in again.', 'refresh_reuse');
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) throw unauthorized('Your session has expired. Sign in again.', 'refresh_expired');
    const claimed = await db.update(refreshTokens).set({ usedAt: sql`now()` }).where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt))).returning({ id: refreshTokens.id });
    if (!claimed.length) throw unauthorized('Sign in again.', 'refresh_invalid');
    return row;
  }

  async revokeFamily(familyId: string, realm: 'company' | 'platform'): Promise<void> {
    const db = realm === 'platform' ? this.db.platform : this.db.app;
    await db.update(refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string, realm: 'company' | 'platform'): Promise<void> {
    const db = realm === 'platform' ? this.db.platform : this.db.app;
    await db.update(refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
