import { Module } from '@nestjs/common';
import { employees } from '@trackrex/schemas';
import { crudParts, RESOURCES, apiPathFor } from '../../shared/crud/crud.factory.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { EMPLOYEE_SERVICE, EmployeesService } from './employees/employees.service.js';
import { EmployeesController } from './employees/employees.controller.js';

const parts = crudParts(employees, { service: EmployeesService });
// The custom controller replaces the generated one; keep a single registry entry.
RESOURCES.splice(RESOURCES.findIndex((r) => r.apiPath === apiPathFor(employees)), 1, { kit: employees, apiPath: apiPathFor(employees) });

@Module({
  imports: [AccountsModule],
  controllers: [EmployeesController],
  providers: [parts.depsProvider, { provide: EMPLOYEE_SERVICE, useClass: EmployeesService }],
  exports: [EMPLOYEE_SERVICE],
})
export class HrModule {}
