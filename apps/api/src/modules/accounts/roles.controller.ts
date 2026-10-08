import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { SYSTEM_ROLES } from '@trackrex/schemas';
import { AuditService } from '../../core/audit.service.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, notFound, unprocessable } from '../../core/errors.js';
import { Authz, RbacService, registry, systemGrants } from '../../core/rbac.service.js';
import { currentStore } from '../../core/context.js';

const scopeEnum = z.enum(['all', 'department', 'location', 'team', 'reportees', 'direct', 'self']);
const grants = z.array(z.object({ permission: z.string(), scope: scopeEnum })).max(500);
const roleBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use lowercase letters, numbers and underscores'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  grants,
});

@Controller()
export class RolesController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly audit: AuditService, private readonly rbac: RbacService) {}

  private validate(g: z.infer<typeof grants>) {
    const unknown = g.filter((x) => !registry.byKey.has(x.permission));
    if (unknown.length) throw unprocessable(`Unknown permission: ${unknown[0]!.permission}`, [{ path: 'grants', message: `Unknown permission ${unknown[0]!.permission}` }]);
    const narrow = g.find((x) => x.scope !== 'all' && !registry.byKey.get(x.permission)!.scopeable);
    if (narrow) throw unprocessable(`${narrow.permission} cannot be limited by data scope.`, [{ path: 'grants', message: `${narrow.permission} has no data scope` }]);
  }

  @Get('permissions')
  permissions() {
    this.authz.require('company.roles.manage');
    return registry.all;
  }

  @Get('roles')
  async list() {
    this.authz.require('company.roles.manage');
    const custom = (await this.db.q.execute(sql`select key, name, description, grants from roles where deleted_at is null order by name`)).rows as { key: string; name: string; description: string | null; grants: unknown }[];
    return [
      ...SYSTEM_ROLES.map((r) => ({ key: r.key, name: r.name, description: r.description, system: true, grants: systemGrants(r.key) })),
      ...custom.map((r) => ({ ...r, system: false })),
    ];
  }

  /** What would a user with these roles be able to do? Shown in the roles editor before saving. */
  @Get('roles/effective')
  async effective(@Query('roleKeys') raw = '') {
    this.authz.require('company.roles.manage');
    const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const map = await this.rbac.resolve(currentStore().tenantId!, keys);
    return [...map].map(([permission, scope]) => ({ permission, scope }));
  }

  @Post('roles')
  async create(@Body() body: unknown) {
    this.authz.require('company.roles.manage');
    const b = roleBody.parse(body);
    if (SYSTEM_ROLES.some((r) => r.key === b.key)) throw conflict('role_key_taken', 'That key is used by a built-in role.');
    this.validate(b.grants);
    try {
      await this.db.q.execute(sql`insert into roles (tenant_id, key, name, description, grants, created_by) values (app_tenant_id(), ${b.key}, ${b.name}, ${b.description ?? null}, ${JSON.stringify(b.grants)}::jsonb, app_user_id())`);
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code === '23505') throw conflict('role_key_taken', 'A role with that key already exists.');
      throw e;
    }
    this.rbac.invalidate(currentStore().tenantId);
    await this.audit.record({ entity: 'roles', entityId: b.key, action: 'created', changes: { name: { new: b.name }, grants: { new: b.grants.length } } });
    return { key: b.key };
  }

  @Patch('roles/:key')
  async update(@Param('key') key: string, @Body() body: unknown) {
    this.authz.require('company.roles.manage');
    if (SYSTEM_ROLES.some((r) => r.key === key)) throw conflict('role_protected', 'Built-in roles cannot be edited. Create a custom role instead.');
    const b = roleBody.omit({ key: true }).partial().parse(body);
    if (b.grants) this.validate(b.grants);
    const res = await this.db.q.execute(sql`update roles set name = coalesce(${b.name ?? null}, name), description = coalesce(${b.description ?? null}, description), grants = coalesce(${b.grants ? JSON.stringify(b.grants) : null}::jsonb, grants), updated_at = now(), updated_by = app_user_id(), version = version + 1 where key = ${key} and deleted_at is null`);
    if (!res.rowCount) throw notFound('Role');
    this.rbac.invalidate(currentStore().tenantId);
    await this.audit.record({ entity: 'roles', entityId: key, action: 'updated', changes: { ...(b.name ? { name: { new: b.name } } : {}), ...(b.grants ? { grants: { new: b.grants.length } } : {}) } });
    return { key };
  }

  @Delete('roles/:key') @HttpCode(204)
  async remove(@Param('key') key: string): Promise<void> {
    this.authz.require('company.roles.manage');
    const inUse = await this.db.app.execute(sql`select 1 from platform.memberships where tenant_id = ${currentStore().tenantId} and ${key} = any(role_keys) and status <> 'removed' limit 1`);
    if (inUse.rows.length) throw conflict('role_in_use', 'Some users still have this role. Change their roles first.');
    const res = await this.db.q.execute(sql`update roles set deleted_at = now(), deleted_by = app_user_id() where key = ${key} and deleted_at is null`);
    if (!res.rowCount) throw notFound('Role');
    this.rbac.invalidate(currentStore().tenantId);
    await this.audit.record({ entity: 'roles', entityId: key, action: 'deleted' });
  }
}
