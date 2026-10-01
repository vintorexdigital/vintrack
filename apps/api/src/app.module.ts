import { Controller, Get, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './core/auth/decorators.js';
import { CoreModule } from './core/core.module.js';
import { Db } from './core/database/db.service.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public() @Get('health')
  async health() {
    await this.db.app.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [CoreModule, AccountsModule, PlatformModule, OrgModule, HrModule, AuditModule, SettingsModule],
  controllers: [HealthController],
})
export class AppModule {}
