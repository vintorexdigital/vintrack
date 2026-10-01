import { Injectable } from '@nestjs/common';
import { ALL_MODULES, PLAN_CATALOG, type ModuleKey } from '@trackrex/schemas';
import type { TenantRow } from '../../core/auth/tenant-directory.service.js';

export { ALL_MODULES, type ModuleKey };

@Injectable()
export class EntitlementsService {
  modules(tenant: Pick<TenantRow, 'planKey' | 'featureFlags'>): ModuleKey[] {
    const base = (PLAN_CATALOG.find((p) => p.key === tenant.planKey) ?? PLAN_CATALOG[0]!).modules;
    const flags = (tenant.featureFlags ?? {}) as Record<string, boolean>;
    const extra = Object.entries(flags).filter(([, on]) => on).map(([k]) => k).filter((k): k is ModuleKey => (ALL_MODULES as readonly string[]).includes(k));
    return [...new Set([...base, ...extra])];
  }
}
