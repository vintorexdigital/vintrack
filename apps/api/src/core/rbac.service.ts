import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { ALL_KITS, buildPermissionRegistry, SYSTEM_ROLES, grantsFor, type Grant } from '@trackrex/schemas';
import { Db } from './database/db.service.js';
import { currentAuth, SCOPE_ORDER, type AuthContext, type Scope } from './context.js';
import { forbidden } from './errors.js';

export const registry = buildPermissionRegistry(ALL_KITS);

/** Deny list applied to support sessions: staff can debug configuration, never business data. */
const SUPPORT_DENY = ['location.', 'productivity.', 'payroll.', 'calls.', 'hr.payroll', 'reports.', 'feed.', 'attendance.punch.', 'company.export', 'company.encryption', 'company.messages', 'automation.run', 'onboarding.', 'helpdesk.ticket', 'helpdesk.asset'];

const widest = (a: Scope | undefined, b: Scope): Scope => (a && SCOPE_ORDER.indexOf(a) >= SCOPE_ORDER.indexOf(b) ? a : b);

export function systemGrants(roleKey: string): Grant[] {
  const role = SYSTEM_ROLES.find((r) => r.key === roleKey);
  return role ? grantsFor(role, registry) : [];
}

@Injectable()
export class RbacService {
  private cache = new Map<string, { at: number; grants: Map<string, Scope> }>();
  constructor(private readonly db: Db) {}

  invalidate(tenantId?: string): void {
    if (!tenantId) this.cache.clear();
    else for (const k of this.cache.keys()) if (k.startsWith(tenantId)) this.cache.delete(k);
  }

  /** Union of the grants for a membership's roles, taking the widest scope per permission. */
  async resolve(tenantId: string, roleKeys: string[], support = false): Promise<Map<string, Scope>> {
    const cacheKey = `${tenantId}:${[...roleKeys].sort().join(',')}:${support}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < 30_000) return hit.grants;

    const custom = await this.db.runAsTenant(tenantId, {}, async () => {
      const res = await this.db.q.execute(sql`select key, grants from roles where deleted_at is null and key = any(${sql.param(roleKeys)}::text[])`);
      return res.rows as { key: string; grants: Grant[] }[];
    });
    const byKey = new Map(custom.map((r) => [r.key, r.grants]));
    const out = new Map<string, Scope>();
    for (const key of roleKeys) {
      const grants = byKey.get(key) ?? systemGrants(key);
      for (const g of grants) out.set(g.permission, widest(out.get(g.permission), g.scope as Scope));
    }
    if (support) for (const k of [...out.keys()]) if (SUPPORT_DENY.some((p) => k.startsWith(p))) out.delete(k);
    this.cache.set(cacheKey, { at: Date.now(), grants: out });
    return out;
  }
}

/** Server-side authorization helpers used by services. Controllers never build visibility filters. */
@Injectable()
export class Authz {
  has(permission: string, auth: AuthContext = currentAuth()): boolean {
    return auth.permissions.has(permission);
  }

  require(permission: string, auth: AuthContext = currentAuth()): Scope {
    const scope = auth.permissions.get(permission);
    if (!scope) throw forbidden(`You need the "${permission}" permission.`, 'permission_denied');
    return scope;
  }

  requireAny(permissions: string[], auth: AuthContext = currentAuth()): void {
    if (!permissions.some((p) => auth.permissions.has(p))) throw forbidden('You do not have permission to do that.', 'permission_denied');
  }
}

/** Turns a viewer's data scope into a SQL predicate over an employee-id column. */
@Injectable()
export class ScopeResolver {
  predicate(scope: Scope, column: SQL, opts: { directOnly?: boolean; auth?: AuthContext } = {}): SQL | undefined {
    const auth = opts.auth ?? currentAuth();
    const me = auth.employeeId;
    const effective: Scope = opts.directOnly && SCOPE_ORDER.indexOf(scope) > SCOPE_ORDER.indexOf('direct') ? 'direct' : scope;
    if (effective === 'all') return undefined;
    if (!me) return sql`false`;
    switch (effective) {
      case 'self': return sql`${column} = ${me}::uuid`;
      case 'direct': return sql`(${column} = ${me}::uuid or ${column} in (select direct_reportee_ids(${me}::uuid)))`;
      case 'reportees': return sql`(${column} = ${me}::uuid or ${column} in (select reportee_ids(${me}::uuid)))`;
      case 'team': return sql`${column} in (select team_scope_ids(${me}::uuid))`;
      case 'department': return sql`${column} in (select department_scope_ids(${me}::uuid))`;
      case 'location': return sql`${column} in (select location_scope_ids(${me}::uuid))`;
    }
  }
}
