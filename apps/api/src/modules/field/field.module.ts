import { Body, Controller, Delete, Get, HttpCode, Inject, Module, Param, Post, Query } from '@nestjs/common';
import { contacts, customers, formTemplates, geoFences, idParam, tasks } from '@trackrex/schemas';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudModule, crudParts } from '../../shared/crud/crud.factory.js';
import { ContactsService } from './contacts.service.js';
import { TaskFormsService } from './forms.service.js';
import { TASKS_SERVICE, TasksService } from './tasks.service.js';
import { TrackingService } from './tracking.service.js';

const taskParts = crudParts(tasks, { service: TasksService });
const contactParts = crudParts(contacts, { service: ContactsService });

@Controller(apiPathFor(tasks))
class TasksController extends CrudController {
  constructor(@Inject(TASKS_SERVICE) protected override readonly service: TasksService, private readonly forms: TaskFormsService) { super(service); }
  @Get('summary') summary() { return this.service.summary(); }
  @Get(':id/form') form(@Param() p: unknown) { return this.forms.get(idParam.parse(p).id); }
  @Post(':id/form') @HttpCode(200) attachForm(@Param() p: unknown, @Body() b: unknown) { return this.forms.attach(idParam.parse(p).id, b); }
  @Delete(':id/form') @HttpCode(200) detachForm(@Param() p: unknown) { return this.forms.detach(idParam.parse(p).id); }
  @Post(':id/form/answers') @HttpCode(200) saveAnswers(@Param() p: unknown, @Body() b: unknown) { return this.forms.save(idParam.parse(p).id, b); }
  @Post(':id/check-in') @HttpCode(200) checkIn(@Param() p: unknown, @Body() b: unknown) { return this.service.checkIn(idParam.parse(p).id, b); }
  @Post(':id/complete') @HttpCode(200) complete(@Param() p: unknown, @Body() b: unknown) { return this.service.complete(idParam.parse(p).id, b); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param() p: unknown, @Body() b: unknown) { return this.service.cancel(idParam.parse(p).id, b); }
}

@Controller('location')
class LocationController {
  constructor(private readonly tracking: TrackingService) {}
  @Get('policy') policy() { return this.tracking.policy(); }
  @Post('pings') @HttpCode(200) ingest(@Body() b: unknown) { return this.tracking.ingest(b); }
  @Get('live') live() { return this.tracking.live(); }
  @Get('trail') trail(@Query() q: unknown) { return this.tracking.trail(q); }
}

@Module({ controllers: [TasksController], providers: [taskParts.depsProvider, { provide: TASKS_SERVICE, useClass: TasksService }, TaskFormsService] })
class TasksModule {}

@Module({ controllers: [contactParts.Controller], providers: [contactParts.depsProvider, { provide: contactParts.token, useClass: ContactsService }] })
class ContactsModule {}

/** Field operations: geo-fences, customers, contacts, tasks, and location tracking. */
@Module({
  imports: [crudModule(geoFences), crudModule(customers), crudModule(formTemplates), TasksModule, ContactsModule],
  controllers: [LocationController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class FieldModule {}
