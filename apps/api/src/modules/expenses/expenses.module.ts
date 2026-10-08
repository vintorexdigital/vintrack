import { RequiresModule } from '../../core/auth/decorators.js';
import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, type OnModuleInit } from '@nestjs/common';
import { expenseCategories, expenseClaims, idParam } from '@trackrex/schemas';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudModule, crudParts } from '../../shared/crud/crud.factory.js';
import { Db } from '../../core/database/db.service.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProvisioningService } from '../accounts/provisioning.service.js';
import { seedExpenseDefaults } from './expenses.seed.js';
import { EXPENSES_SERVICE, ExpenseClaimsService } from './expenses.service.js';

const parts = crudParts(expenseClaims, { service: ExpenseClaimsService });

@RequiresModule('expenses')
@Controller(apiPathFor(expenseClaims))
class ExpenseClaimsController extends CrudController {
  constructor(@Inject(EXPENSES_SERVICE) protected override readonly service: ExpenseClaimsService) { super(service); }
  @Get('summary') summary() { return this.service.summary(); }
  @Post('approve') @HttpCode(200) bulkApprove(@Body() b: unknown) { return this.service.bulkApprove(b); }
  @Post(':id/approve') @HttpCode(200) approve(@Param() p: unknown, @Body() b: unknown) { return this.service.approve(idParam.parse(p).id, b); }
  @Post(':id/reject') @HttpCode(200) reject(@Param() p: unknown, @Body() b: unknown) { return this.service.reject(idParam.parse(p).id, b); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param() p: unknown) { return this.service.cancel(idParam.parse(p).id); }
  @Post(':id/pay') @HttpCode(200) pay(@Param() p: unknown, @Body() b: unknown) { return this.service.pay(idParam.parse(p).id, b); }
}

@Module({ controllers: [ExpenseClaimsController], providers: [parts.depsProvider, { provide: EXPENSES_SERVICE, useClass: ExpenseClaimsService }] })
class ClaimsModule {}

/** Expense categories and claims. */
@Module({ imports: [AccountsModule, crudModule(expenseCategories), ClaimsModule] })
export class ExpensesModule implements OnModuleInit {
  constructor(private readonly provisioning: ProvisioningService, private readonly db: Db) {}
  onModuleInit(): void {
    this.provisioning.registerSeeder((ctx) => seedExpenseDefaults(this.db, ctx));
  }
}
