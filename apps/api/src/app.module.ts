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
}

@Module({
  imports: [CoreModule, AccountsModule, PlatformModule, OrgModule, HrModule, AuditModule, SettingsModule, TimeModule, AttendanceModule, LeaveModule, FieldModule, FeedModule, BillingModule, ProductivityModule, FilesModule, ExpensesModule, NotificationsModule, ReportsModule, JobsModule, HomeModule],
  controllers: [HealthController],
})
export class AppModule {}
