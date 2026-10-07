import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL_MODULES, PLAN_CATALOG } from '@trackrex/schemas';
import { currentStore } from '../context.js';
import { notLicensed } from '../errors.js';
import { REQUIRES_MODULE } from './decorators.js';
import { TenantDirectory } from './tenant-directory.service.js';

const NAME: Record<string, string> = {
  tasks: 'tasks and forms', tracking: 'location tracking', customers: 'customers', leads: 'leads', call_log: 'the call log', cloud_calling: 'cloud calling', expenses: 'expenses',
  desktop_activity: 'desktop activity', workflows: 'workflows', timesheets: 'timesheets', attendance: 'attendance', leave: 'leave',
};

/**
 * Plans decide which modules a company has. The console hides the rest, and this refuses them at the API too, so a
 * crafted request cannot use a module the plan does not include. Runs after sign-in.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly dir: TenantDirectory) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_MODULE, [ctx.getHandler(), ctx.getClass()]);
    if (!module) return true;
    const store = currentStore();
    const tenantId = store.auth?.tenantId;
    if (store.auth?.realm !== 'company' || !tenantId) return true;
    const tenant = await this.dir.tenant(tenantId);
    if (!tenant) return true;
    const base = (PLAN_CATALOG.find((p) => p.key === tenant.planKey) ?? PLAN_CATALOG[0]!).modules as readonly string[];
    const flags = (tenant.featureFlags ?? {}) as Record<string, boolean>;
    const on = base.includes(module) || (flags[module] === true && (ALL_MODULES as readonly string[]).includes(module));
    if (!on) throw notLicensed(NAME[module] ?? module);
    return true;
  }
}
