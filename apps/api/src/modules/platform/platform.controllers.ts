import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { idParam, platformLoginBody } from '@trackrex/schemas';
import { AllowPending2fa, Public, PlatformRealm, PlatformRoles } from '../../core/auth/decorators.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { unauthorized } from '../../core/errors.js';
import { PlatformAuthService, type PlatformSignIn } from './platform-auth.service.js';
import { TenantsAdminService } from './tenants-admin.service.js';

const COOKIE = 'trk_prt';

@PlatformRealm()
@Controller('platform/v1/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  private out(res: Response, r: PlatformSignIn) {
    if (r.status === 'ok') {
      res.cookie(COOKIE, r.refreshToken, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/platform/v1/auth', maxAge: 86_400_000 });
      const { refreshToken: _r, ...rest } = r;
      void _r;
      return rest;
    }
    return r;
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = platformLoginBody.parse(body);
    const s = currentStore();
    return this.out(res, await this.auth.login(b.email, b.password, b.totp, s.ip, s.userAgent));
  }

  @AllowPending2fa() @Post('totp/enroll') @HttpCode(200)
  async enroll(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const s = currentStore();
    return this.out(res, await this.auth.enrollTotp(currentAuth().userId, z.object({ code: z.string().regex(/^\d{6}$/) }).parse(body).code, s.ip, s.userAgent));
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (!token) throw unauthorized('Sign in to continue.', 'refresh_missing');
    const s = currentStore();
    return this.out(res, await this.auth.refresh(token, s.ip, s.userAgent));
  }

  @Get('me')
  me() {
    const a = currentAuth();
    return { id: a.userId, role: a.platformRole };
  }
}

@PlatformRealm()
@Controller('platform/v1')
export class TenantsAdminController {
  constructor(private readonly tenants: TenantsAdminService) {}

  @Get('overview') @PlatformRoles('support', 'finance', 'onboarding', 'analyst')
  overview() { return this.tenants.overview(); }

  @Get('tenants') @PlatformRoles('support', 'finance', 'onboarding', 'analyst')
  list(@Query() q: Record<string, string>) { return this.tenants.list(q); }

  @Get('tenants/:id') @PlatformRoles('support', 'finance', 'onboarding', 'analyst')
  get(@Param() p: unknown) { return this.tenants.get(idParam.parse(p).id); }

  @Post('tenants') @PlatformRoles('onboarding')
  create(@Body() body: unknown) { return this.tenants.create(body); }

  @Patch('tenants/:id') @PlatformRoles('onboarding', 'finance')
  update(@Param() p: unknown, @Body() body: unknown) { return this.tenants.update(idParam.parse(p).id, body); }

  @Post('tenants/:id/lifecycle') @HttpCode(200) @PlatformRoles('onboarding', 'finance')
  lifecycle(@Param() p: unknown, @Body() body: unknown) { return this.tenants.lifecycle(idParam.parse(p).id, body); }

  @Post('tenants/:id/support-sessions') @PlatformRoles('support')
  startSupport(@Param() p: unknown, @Body() body: unknown) { return this.tenants.startSupportSession(idParam.parse(p).id, body); }

  @Post('support-sessions/:id/end') @HttpCode(200) @PlatformRoles('support')
  endSupport(@Param() p: unknown) { return this.tenants.endSupportSession(idParam.parse(p).id); }

  @Get('audit') @PlatformRoles('support', 'finance', 'analyst')
  audit(@Query() q: { tenantId?: string; limit?: string }) { return this.tenants.auditLog({ ...(q.tenantId ? { tenantId: q.tenantId } : {}), ...(q.limit ? { limit: Number(q.limit) } : {}) }); }

  @Get('resellers') @PlatformRoles('onboarding', 'finance', 'analyst', 'support')
  resellers() { return this.tenants.resellers(); }

  @Get('company-groups') @PlatformRoles('onboarding', 'finance', 'analyst', 'support')
  groups() { return this.tenants.groups(); }
}
