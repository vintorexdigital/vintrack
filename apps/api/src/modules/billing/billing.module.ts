import { Body, Controller, Get, Headers, HttpCode, Inject, Module, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { idParam, PLAN_CATALOG } from '@trackrex/schemas';
import { Public, PlatformRealm, PlatformRoles } from '../../core/auth/decorators.js';
import { invoices } from '../../core/auth/platform.tables.js';
import { CONFIG, type Config } from '../../core/config.js';
import { Db } from '../../core/database/db.service.js';
import { badRequest } from '../../core/errors.js';
import { BillingService } from './billing.service.js';
import { CompanyBillingService } from './company-billing.service.js';
import { PAYMENT_PROVIDER, providerFromConfig, type PaymentProvider } from './payment-provider.js';

@Controller('billing')
class CompanyBillingController {
  constructor(private readonly svc: CompanyBillingService) {}
  @Get('subscription') subscription() { return this.svc.subscription(); }
  @Post('subscribe') @HttpCode(200) subscribe(@Body() b: unknown) { return this.svc.subscribe(b); }
  @Post('change') @HttpCode(200) change(@Body() b: unknown) { return this.svc.change(b); }
  @Get('invoices') invoices() { return this.svc.invoices(); }
  @Get('invoices/:id') invoice(@Param() p: unknown) { return this.svc.invoice(idParam.parse(p).id); }
  @Post('invoices/:id/pay') @HttpCode(200) pay(@Param() p: unknown, @Body() b: { returnUrl?: string }) { return this.svc.pay(idParam.parse(p).id, b?.returnUrl); }
  @Get('invoices/:id/print')
  async print(@Param() p: unknown, @Res() res: Response) {
    res.type('text/html').send(await this.svc.html(idParam.parse(p).id));
  }
}

/** Public: the pricing page reads this. Prices come from the database, descriptions from the catalogue. */
@Controller('public')
class PublicPlansController {
  constructor(private readonly billing: BillingService) {}
  @Public() @Get('plans')
  async plans() {
    const rows = await this.billing.listPlans();
    return PLAN_CATALOG.filter((p) => p.purchasable).map((p) => ({ key: p.key, name: p.name, tagline: p.tagline, highlights: p.highlights, prices: rows.find((r) => r.key === p.key)?.prices ?? {} }));
  }
}

@Controller('webhooks')
class WebhookController {
  constructor(private readonly billing: BillingService, private readonly db: Db, @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}
  @Public() @Post('billing') @HttpCode(200)
  async hook(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>) {
    const event = req.rawBody ? this.provider.parseWebhook(req.rawBody, headers) : null;
    if (!event) throw badRequest('invalid_webhook', 'The webhook signature is not valid.');
    const [inv] = await this.db.platform.select().from(invoices).where(and(eq(invoices.provider, this.provider.name), eq(invoices.providerRef, event.providerRef)));
    if (!inv) return { received: true, matched: false };
    await this.billing.recordPayment(inv.id, { amountMinor: event.amountMinor || inv.totalMinor }, { method: this.provider.name, providerEventId: event.eventId });
    return { received: true, matched: true };
  }
}

@PlatformRealm()
@Controller('platform/v1')
class PlatformBillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('plans') @PlatformRoles('finance', 'onboarding', 'support', 'analyst') plans() { return this.billing.listPlans(); }
  @Put('plans/:key') @PlatformRoles('finance') updatePlan(@Param('key') key: string, @Body() b: unknown) { return this.billing.updatePlan(key, b); }
  @Get('billing/overview') @PlatformRoles('finance', 'analyst') overview() { return this.billing.overview(); }
  @Get('invoices') @PlatformRoles('finance', 'support', 'analyst') list(@Query() q: { tenantId?: string; status?: string; limit?: string }) { return this.billing.list({ ...(q.tenantId ? { tenantId: q.tenantId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.limit ? { limit: Number(q.limit) } : {}) }); }
  @Get('invoices/:id') @PlatformRoles('finance', 'support', 'analyst') get(@Param() p: unknown) { return this.billing.get(idParam.parse(p).id); }
  @Post('tenants/:id/invoices') @PlatformRoles('finance') generate(@Param() p: unknown, @Body() b: unknown) { return this.billing.generate(idParam.parse(p).id, b); }
  @Post('invoices/:id/payments') @PlatformRoles('finance') pay(@Param() p: unknown, @Body() b: unknown) { return this.billing.recordPayment(idParam.parse(p).id, b); }
  @Post('invoices/:id/void') @HttpCode(200) @PlatformRoles('finance') void(@Param() p: unknown, @Body() b: unknown) { return this.billing.void(idParam.parse(p).id, b); }
}

@Module({
  controllers: [CompanyBillingController, PublicPlansController, WebhookController, PlatformBillingController],
  providers: [BillingService, CompanyBillingService, { provide: PAYMENT_PROVIDER, inject: [CONFIG], useFactory: (cfg: Config) => providerFromConfig(cfg) }],
  exports: [BillingService, PAYMENT_PROVIDER],
})
export class BillingModule {}
