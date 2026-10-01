import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, gt } from 'drizzle-orm';
import type { Request } from 'express';
import { CONFIG, type Config } from '../config.js';
import { Db } from '../database/db.service.js';
import { currentStore, type AuthContext } from '../context.js';
import { forbidden, unauthorized, AppError } from '../errors.js';
import { RbacService } from '../rbac.service.js';
import { ALLOW_PENDING_2FA, ALLOW_SUSPENDED, IS_PUBLIC, PLATFORM_ROLES, REALM } from './decorators.js';
import { platformUsers, supportSessions } from './platform.tables.js';
import { TenantDirectory } from './tenant-directory.service.js';
import { TokensService } from './tokens.service.js';
import { ipAllowed } from './ip.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly rbac: RbacService,
    private readonly dir: TenantDirectory,
    private readonly db: Db,
    @Inject(CONFIG) private readonly cfg: Config,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const realm = this.reflector.getAllAndOverride<string>(REALM, targets) ?? 'company';
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized();
    const store = currentStore();

    if (realm === 'platform') {
      const claims = await this.tokens.verifyPlatform(token).catch((e: unknown) => {
        throw e instanceof AppError ? e : unauthorized();
      });
      if (claims.pending2fa && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_2FA, targets)) {
        throw unauthorized('Finish two-factor sign-in first.', 'two_factor_required');
      }
      const [u] = await this.db.platform.select().from(platformUsers).where(eq(platformUsers.id, claims.sub)).limit(1);
      if (!u || u.status !== 'active') throw unauthorized('This account is not active.', 'account_inactive');
      if (!ipAllowed(store.ip, u.ipAllowlist, this.cfg.PLATFORM_ALLOW_ANY_IP_WHEN_EMPTY)) {
        throw forbidden('Sign-in from this network is not allowed.', 'ip_not_allowed');
      }
      const roles = this.reflector.getAllAndOverride<string[]>(PLATFORM_ROLES, targets);
      if (roles?.length && !roles.includes(u.role) && u.role !== 'super_admin') throw forbidden('Your platform role cannot do that.', 'permission_denied');
      store.auth = { realm: 'platform', userId: u.id, roleKeys: [], permissions: new Map(), platformRole: u.role } satisfies AuthContext;
      return true;
    }

    const claims = await this.tokens.verifyCompany(token);
    const tenant = await this.dir.tenant(claims.tid);
    if (!tenant) throw unauthorized('That company no longer exists.', 'tenant_missing');
    if (tenant.status === 'deleted' || tenant.status === 'cancelled') throw forbidden('This company account is closed.', 'tenant_inactive');
    if (tenant.status === 'suspended' && req.method !== 'GET' && !this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED, targets)) {
      throw new AppError(423, 'tenant_suspended', 'This company is suspended and read-only. Ask the owner to update billing.');
    }
    let roleKeys = claims.rk;
    let isOwner = !!claims.own;
    let employeeId = claims.eid ?? null;
    if (claims.sup) {
      const [s] = await this.db.platform.select().from(supportSessions).where(and(eq(supportSessions.id, claims.sup.sid), isNull(supportSessions.endedAt), gt(supportSessions.expiresAt, new Date().toISOString()))).limit(1);
      if (!s || !tenant.supportAccessEnabled) throw unauthorized('The support session has ended.', 'support_session_ended');
      roleKeys = ['admin'];
      isOwner = false;
      employeeId = null;
    } else {
      const m = await this.dir.membership(claims.mid, claims.tid);
      if (!m || m.status !== 'active' || m.userId !== claims.sub) throw unauthorized('Your access to this company has ended.', 'membership_inactive');
      roleKeys = m.roleKeys;
      isOwner = m.isOwner;
      employeeId = m.employeeId;
    }
    const permissions = await this.rbac.resolve(claims.tid, isOwner ? [...new Set([...roleKeys, 'owner'])] : roleKeys, !!claims.sup);
    store.source = claims.src;
    store.auth = {
      realm: 'company', userId: claims.sub, tenantId: claims.tid, membershipId: claims.mid, employeeId, roleKeys, isOwner, permissions,
      ...(claims.sup ? { support: { sessionId: claims.sup.sid, staffId: claims.sup.staff } } : {}),
    };
    return true;
  }
}
