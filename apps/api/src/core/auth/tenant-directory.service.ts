import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Db } from '../database/db.service.js';
import { memberships, tenants } from './platform.tables.js';

export type TenantRow = typeof tenants.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;

/** Short-lived in-process cache for hot lookups made on every request. */
@Injectable()
export class TenantDirectory {
  private tenantCache = new Map<string, { at: number; row: TenantRow | null }>();
  private membershipCache = new Map<string, { at: number; row: MembershipRow | null }>();
  constructor(private readonly db: Db) {}

  async tenant(id: string): Promise<TenantRow | null> {
    const hit = this.tenantCache.get(id);
    if (hit && Date.now() - hit.at < 15_000) return hit.row;
    const [row] = await this.db.app.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    this.tenantCache.set(id, { at: Date.now(), row: row ?? null });
    return row ?? null;
  }

  async membership(id: string, tenantId: string): Promise<MembershipRow | null> {
    const key = `${tenantId}:${id}`;
    const hit = this.membershipCache.get(key);
    if (hit && Date.now() - hit.at < 15_000) return hit.row;
    const [row] = await this.db.app.select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.tenantId, tenantId))).limit(1);
    this.membershipCache.set(key, { at: Date.now(), row: row ?? null });
    return row ?? null;
  }

  invalidate(tenantId?: string): void {
    if (!tenantId) {
      this.tenantCache.clear();
      this.membershipCache.clear();
      return;
    }
    this.tenantCache.delete(tenantId);
    for (const k of this.membershipCache.keys()) if (k.startsWith(tenantId)) this.membershipCache.delete(k);
  }
}
