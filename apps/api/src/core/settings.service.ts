import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from './database/db.service.js';
import { currentAuth, currentStore } from './context.js';
import { AuditService } from './audit.service.js';

export type SettingScope = { type: 'tenant' } | { type: 'shift' | 'team' | 'employee'; id: string };

/** Typed key-value settings with tenant, shift, team and employee scopes. Definitions live in the registry. */
@Injectable()
export class SettingsService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  async getAll(scope: SettingScope = { type: 'tenant' }): Promise<Record<string, unknown>> {
    const id = 'id' in scope ? scope.id : null;
    const res = await this.db.q.execute(sql`select key, value from settings where scope_type = ${scope.type} and scope_id is not distinct from ${id}::uuid`);
    return Object.fromEntries((res.rows as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  }

  async get<T>(key: string, fallback: T, scope: SettingScope = { type: 'tenant' }): Promise<T> {
    const id = 'id' in scope ? scope.id : null;
    const res = await this.db.q.execute(sql`select value from settings where scope_type = ${scope.type} and scope_id is not distinct from ${id}::uuid and key = ${key}`);
    const row = res.rows[0] as { value: T } | undefined;
    return row ? row.value : fallback;
  }

  async set(key: string, value: unknown, scope: SettingScope = { type: 'tenant' }): Promise<void> {
    const id = 'id' in scope ? scope.id : null;
    const before = await this.get<unknown>(key, null, scope);
    await this.db.q.execute(sql`
      insert into settings (tenant_id, scope_type, scope_id, key, value, updated_by)
      values (${currentStore().tenantId}, ${scope.type}, ${id}::uuid, ${key}, ${JSON.stringify(value)}::jsonb, ${currentAuth().userId})
      on conflict (tenant_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
      do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`);
    if (JSON.stringify(before) !== JSON.stringify(value)) {
      await this.audit.record({ entity: 'settings', entityId: id ?? undefined, action: 'updated', changes: { [key]: { old: before, new: value } } });
    }
  }

  async reset(key: string, scope: SettingScope = { type: 'tenant' }): Promise<void> {
    const id = 'id' in scope ? scope.id : null;
    const before = await this.get<unknown>(key, null, scope);
    await this.db.q.execute(sql`delete from settings where scope_type = ${scope.type} and scope_id is not distinct from ${id}::uuid and key = ${key}`);
    await this.audit.record({ entity: 'settings', action: 'reset', changes: { [key]: { old: before, new: null } } });
  }
}
