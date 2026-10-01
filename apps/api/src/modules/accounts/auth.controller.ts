import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { acceptInvitationBody, loginBody, oidcBody, otpRequestBody, otpVerifyBody, refreshBody, selectCompanyBody, switchCompanyBody } from '@trackrex/schemas';
import { Public } from '../../core/auth/decorators.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { CONFIG, type Config } from '../../core/config.js';
import { unauthorized } from '../../core/errors.js';
import { Inject } from '@nestjs/common';
import { AuthService, type ClientInfo, type SignInResult } from './auth.service.js';

const COOKIE = 'trk_rt';

/** Resolve the company hint: explicit body value, X-Tenant header, then the subdomain of the host. */
function tenantHint(req: Request, body: string | undefined, primaryDomain: string): string | undefined {
  if (body) return body;
  const header = req.headers['x-tenant'];
  if (typeof header === 'string' && header) return header;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '';
  const m = new RegExp(`^([a-z0-9-]+)\\.app\\.${primaryDomain.replace(/\./g, '\\.')}`, 'i').exec(host);
  return m?.[1];
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(CONFIG) private readonly cfg: Config) {}

  private client(deviceId?: string): ClientInfo {
    const s = currentStore();
    return { source: s.source, ip: s.ip, userAgent: s.userAgent, deviceId };
  }

  /** Web keeps the refresh token in an httpOnly cookie; apps receive it in the body and store it securely. */
  private respond(res: Response, result: SignInResult): SignInResult | Omit<Extract<SignInResult, { status: 'ok' }>, 'refreshToken'> {
    if (result.status !== 'ok') return result;
    if (currentStore().source === 'web') {
      res.cookie(COOKIE, result.refreshToken, { httpOnly: true, sameSite: 'lax', secure: this.cfg.NODE_ENV === 'production', path: '/v1/auth', maxAge: this.cfg.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
      const { refreshToken: _omit, ...rest } = result;
      void _omit;
      return rest;
    }
    return result;
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = loginBody.parse(body);
    return this.respond(res, await this.auth.loginWithPassword(b.identifier, b.password, tenantHint(req, b.tenant, this.cfg.PRIMARY_DOMAIN), this.client(b.deviceId)));
  }

  @Public() @Post('otp/request') @HttpCode(200)
  otpRequest(@Body() body: unknown) {
    return this.auth.requestOtp(otpRequestBody.parse(body).identifier, currentStore().ip);
  }

  @Public() @Post('otp/verify') @HttpCode(200)
  async otpVerify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = otpVerifyBody.parse(body);
    return this.respond(res, await this.auth.verifyOtp(b.identifier, b.code, tenantHint(req, b.tenant, this.cfg.PRIMARY_DOMAIN), this.client(b.deviceId)));
  }

  @Public() @Post('oidc') @HttpCode(200)
  async oidc(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = oidcBody.parse(body);
    return this.respond(res, await this.auth.loginWithOidc(b.provider, b.idToken, tenantHint(req, b.tenant, this.cfg.PRIMARY_DOMAIN), this.client()));
  }

  @Public() @Post('select-company') @HttpCode(200)
  async select(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = selectCompanyBody.parse(body);
    return this.respond(res, await this.auth.selectCompany(b.selectionToken, b.tenantId, this.client()));
  }

  @Post('switch-company') @HttpCode(200)
  async switchCompany(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = switchCompanyBody.parse(body);
    return this.respond(res, await this.auth.switchCompany(currentAuth().userId, b.tenantId, this.client()));
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = refreshBody.parse(body ?? {}).refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
    if (!token) throw unauthorized('Sign in to continue.', 'refresh_missing');
    return this.respond(res, await this.auth.refresh(token, this.client()));
  }

  @Public() @Post('logout') @HttpCode(204)
  async logout(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = refreshBody.parse(body ?? {}).refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
    await this.auth.logout(token);
    res.clearCookie(COOKIE, { path: '/v1/auth' });
  }

  @Public() @Get('invitations/preview')
  preview(@Req() req: Request) {
    return this.auth.previewInvitation(String(req.query.token ?? ''));
  }

  @Public() @Post('invitations/accept') @HttpCode(200)
  async accept(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.acceptInvitation(acceptInvitationBody.parse(body), this.client()));
  }

  @Get('me')
  me() {
    return this.auth.me(currentAuth() as never);
  }
}
