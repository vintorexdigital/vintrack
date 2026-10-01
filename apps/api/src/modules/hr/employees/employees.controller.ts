import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { idParam } from '@trackrex/schemas';
import { CrudController } from '../../../shared/crud/crud.controller.js';
import { apiPathFor } from '../../../shared/crud/crud.factory.js';
import { employees } from '@trackrex/schemas';
import { EMPLOYEE_SERVICE, EmployeesService } from './employees.service.js';

// Static routes are declared before the inherited ':id' routes would match them: Nest registers the
// subclass's own methods first, then the base class's.
@Controller(apiPathFor(employees))
export class EmployeesController extends CrudController {
  constructor(@Inject(EMPLOYEE_SERVICE) protected override readonly service: EmployeesService) {
    super(service);
  }

  @Get('counters') counters() { return this.service.counters(); }
  @Get('org-chart') orgChart() { return this.service.orgChart(); }
  @Get('import/template') template() { return this.service.importTemplate(); }
  @Post('import') @HttpCode(200) import(@Body() body: unknown) { return this.service.importRows(body); }
  @Post('transfer') @HttpCode(200) transfer(@Body() body: unknown) { return this.service.transfer(body); }
  @Post(':id/exit') @HttpCode(200) exit(@Param() p: unknown, @Body() body: unknown) { return this.service.exit(idParam.parse(p).id, body); }
  @Post(':id/invite') invite(@Param() p: unknown, @Body() body: unknown) { return this.service.invite(idParam.parse(p).id, body); }
}
