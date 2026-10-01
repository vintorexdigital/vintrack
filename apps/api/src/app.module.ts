import { Controller, Get, Module, Query, HttpCode } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AppError } from './core/errors.js';
import { Public } from './core/auth/decorators.js';
import { CoreModule } from './core/core.module.js';
import { Db } from './core/database/db.service.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { TimeModule } from './modules/time/time.module.js';
import { LeaveModule } from './modules/leave/leave.module.js';
import { FieldModule } from './modules/field/field.module.js';
import { FeedModule } from './modules/feed/feed.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { HomeModule } from './modules/home/home.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { ProductivityModule } from './modules/productivity/productivity.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public() @Get('health')
  async health() {
    await this.db.app.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }

  /**
   * Caddy asks this before it requests a certificate for a custom domain (on-demand TLS), so only domains a company has
   * registered and verified can ever cause one. The public API host does not route /internal.
   */
  @Public() @Get('internal/domain-allowed') @HttpCode(200)
  async domainAllowed(@Query('domain') domain?: string) {
    if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/i.test(domain)) throw new AppError(404, 'not_found', 'Unknown domain.');
    const r = await this.db.app.execute(sql`select 1 from platform.tenant_domains d join platform.tenants t on t.id = d.tenant_id where d.domain = ${domain.toLowerCase()} and d.verified and t.status in ('trial','active','past_due') limit 1`);
    if (!r.rows.length) throw new AppError(404, 'not_found', 'Unknown domain.');
    return { allowed: true };
  }
}

@Module({
  imports: [CoreModule, AccountsModule, PlatformModule, OrgModule, HrModule, AuditModule, SettingsModule, TimeModule, AttendanceModule, LeaveModule, FieldModule, FeedModule, BillingModule, PrivacyModule, ProductivityModule, FilesModule, ExpensesModule, NotificationsModule, ReportsModule, JobsModule, HomeModule],
  controllers: [HealthController],
})
export class AppModule {}
