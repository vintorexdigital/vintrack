import { Controller, HttpCode, Module, Param, Post } from '@nestjs/common';
import { AttendanceModule } from '../modules/attendance/attendance.module.js';
import { BillingModule } from '../modules/billing/billing.module.js';
import { WorkflowsModule } from '../modules/workflows/workflows.module.js';
import { FieldModule } from '../modules/field/field.module.js';
import { PlatformRealm, PlatformRoles } from '../core/auth/decorators.js';
import { JOB_NAMES, JobsService, type JobName } from './jobs.service.js';
import { badRequest } from '../core/errors.js';

/** Operators can trigger a job run by hand (for example after an incident). Scheduling is done by apps/worker. */
@PlatformRealm()
@Controller('platform/v1/jobs')
class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post(':name/run') @HttpCode(200) @PlatformRoles('support')
  async run(@Param('name') name: string) {
    if (!(JOB_NAMES as readonly string[]).includes(name)) throw badRequest('unknown_job', `Unknown job. Choose one of ${JOB_NAMES.join(', ')}.`);
    return this.jobs.run(name as JobName);
  }
}

@Module({ imports: [AttendanceModule, FieldModule, BillingModule, WorkflowsModule], controllers: [JobsController], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
