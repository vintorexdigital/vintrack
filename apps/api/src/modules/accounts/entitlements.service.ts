import { Injectable } from '@nestjs/common';
import type { TenantRow } from '../../core/auth/tenant-directory.service.js';

export const ALL_MODULES = [
  'core', 'attendance', 'leave', 'tracking', 'tasks', 'customers', 'expenses', 'call_log', 'desktop_activity', 'timesheets',
  'leads', 'targets', 'whatsapp', 'payroll', 'onboarding', 'help_desk', 'assets', 'advanced_analytics', 'api', 'white_label',
] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

/** Plan to module map. Phase 8 replaces this with seat bundles read from the billing tables. */
const PLAN_MODULES: Record<string, readonly ModuleKey[]> = {
  trial: ALL_MODULES,
  all_in_one: ALL_MODULES,
  field: ['core', 'attendance', 'leave', 'tracking', 'tasks', 'customers', 'expenses', 'call_log'],
  office: ['core', 'attendance', 'leave', 'desktop_activity', 'timesheets'],
};

@Injectable()
export class EntitlementsService {
  modules(tenant: Pick<TenantRow, 'planKey' | 'featureFlags'>): ModuleKey[] {
    const base = PLAN_MODULES[tenant.planKey] ?? PLAN_MODULES.trial!;
    const flags = (tenant.featureFlags ?? {}) as Record<string, boolean>;
    const extra = Object.entries(flags).filter(([, on]) => on).map(([k]) => k).filter((k): k is ModuleKey => (ALL_MODULES as readonly string[]).includes(k));
    return [...new Set([...base, ...extra])];
  }
}
