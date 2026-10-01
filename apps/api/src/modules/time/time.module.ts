import { Body, Controller, Delete, Get, HttpCode, Inject, Module, OnModuleInit, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { attendancePolicies, breakTypes, idParam, shifts, uuid } from '@trackrex/schemas';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudModule, crudParts, RESOURCES } from '../../shared/crud/crud.factory.js';
import { Db } from '../../core/database/db.service.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProvisioningService } from '../accounts/provisioning.service.js';
import { seedTimeDefaults } from './time.seed.js';
import { PoliciesService, POLICIES_SERVICE } from './policies.service.js';
import { ShiftResolver } from './shift-resolver.service.js';
import { SHIFTS_SERVICE, ShiftsService } from './shifts.service.js';

const shiftParts = crudParts(shifts, { service: ShiftsService });
const policyParts = crudParts(attendancePolicies, { service: PoliciesService });

@Controller(apiPathFor(shifts))
class ShiftsController extends CrudController {
  constructor(@Inject(SHIFTS_SERVICE) protected override readonly service: ShiftsService) {
    super(service);
  }
  @Get(':id/employees') employees(@Param() p: unknown) { return this.service.employees(idParam.parse(p).id); }
  @Get(':id/policies') policies(@Param() p: unknown) { return this.service.policies(idParam.parse(p).id); }
  @Post(':id/assignments') @HttpCode(200) assign(@Param() p: unknown, @Body() body: unknown) { return this.service.assign(idParam.parse(p).id, body); }
  @Delete(':id/assignments/:assignmentId') @HttpCode(200) unassign(@Param() p: unknown) {
    const { id, assignmentId } = z.object({ id: uuid, assignmentId: uuid }).parse(p);
    return this.service.unassign(id, assignmentId);
  }
}

@Controller(apiPathFor(attendancePolicies))
class PoliciesController extends CrudController {
  constructor(@Inject(POLICIES_SERVICE) protected override readonly service: PoliciesService) {
    super(service);
  }
  @Post(':id/publish') @HttpCode(200) publish(@Param() p: unknown) { return this.service.publish(idParam.parse(p).id); }
  @Post(':id/new-version') newVersion(@Param() p: unknown, @Body() body: unknown) { return this.service.newVersion(idParam.parse(p).id, body); }
}

@Module({
  controllers: [ShiftsController],
  providers: [shiftParts.depsProvider, { provide: SHIFTS_SERVICE, useClass: ShiftsService }],
  exports: [SHIFTS_SERVICE],
})
class ShiftsModule {}

@Module({
  controllers: [PoliciesController],
  providers: [policyParts.depsProvider, { provide: POLICIES_SERVICE, useClass: PoliciesService }],
  exports: [POLICIES_SERVICE],
})
class PoliciesModule {}

@Module({
  imports: [AccountsModule, ShiftsModule, PoliciesModule, crudModule(breakTypes)],
  providers: [ShiftResolver],
  exports: [ShiftResolver, PoliciesModule],
})
export class TimeModule implements OnModuleInit {
  constructor(private readonly provisioning: ProvisioningService, private readonly db: Db) {}
  onModuleInit(): void {
    this.provisioning.registerSeeder((ctx) => seedTimeDefaults(this.db, ctx));
  }
}
