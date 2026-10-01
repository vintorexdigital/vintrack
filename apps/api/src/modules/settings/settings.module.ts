import { Body, Controller, Delete, Get, Module, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { SETTINGS, SETTING_BY_KEY, settingValueSchema } from '@trackrex/schemas';
import { Authz } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { currentStore } from '../../core/context.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { EntitlementsService } from '../accounts/entitlements.service.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { notFound, unprocessable } from '../../core/errors.js';

@Controller('settings')
class SettingsController {
  constructor(private readonly authz: Authz, private readonly settings: SettingsService, private readonly dir: TenantDirectory, private readonly ent: EntitlementsService) {}

  /** Definitions for licensed modules, current overrides, and defaults, so the UI can mark "changed from default". */
  @Get()
  async all() {
    this.authz.require('company.settings.read');
    const tenant = await this.dir.tenant(currentStore().tenantId!);
    const modules = new Set<string>(this.ent.modules(tenant!));
    const definitions = SETTINGS.filter((d) => !d.module || modules.has(d.module));
    return { definitions, values: await this.settings.getAll() };
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() body: unknown) {
    this.authz.require('company.settings.update');
    const d = SETTING_BY_KEY.get(key);
    if (!d) throw notFound('Setting');
    const parsed = z.object({ value: z.unknown() }).parse(body);
    const v = settingValueSchema(d).safeParse(parsed.value);
    if (!v.success) throw unprocessable(v.error.issues[0]?.message ?? 'Not a valid value.', [{ path: 'value', message: v.error.issues[0]?.message ?? 'Not valid' }]);
    await this.settings.set(key, v.data);
    return { key, value: v.data };
  }

  @Delete(':key')
  async reset(@Param('key') key: string) {
    this.authz.require('company.settings.update');
    if (!SETTING_BY_KEY.has(key)) throw notFound('Setting');
    await this.settings.reset(key);
    return { key, value: SETTING_BY_KEY.get(key)!.default };
  }
}

@Module({ imports: [AccountsModule], controllers: [SettingsController] })
export class SettingsModule {}
