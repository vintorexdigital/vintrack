import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { signupBody, provisionBody } from '@trackrex/schemas';
import { Public } from '../../core/auth/decorators.js';
import { currentStore } from '../../core/context.js';
import { ProvisioningService } from './provisioning.service.js';

/** Self-serve signup: the same provisioning path as the master admin console, with trial defaults. */
@Controller('signup')
export class SignupController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Public() @Get('slug-available')
  async slugAvailable(@Query('slug') slug = '') {
    const parsed = provisionBody.shape.slug.safeParse(slug);
    if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message ?? 'Not valid' };
    return { available: !(await this.provisioning.findBySlug(parsed.data)) };
  }

  @Public() @Post()
  async signup(@Body() body: unknown) {
    const b = signupBody.parse(body);
    const s = currentStore();
    const out = await this.provisioning.provision(provisionBody.parse({ ...b, planKey: 'trial' }), { type: 'system', ip: s.ip, requestId: s.requestId });
    return { company: { id: out.tenant.id, slug: out.tenant.slug, name: out.tenant.name }, ...('devInviteToken' in out ? { devInviteToken: out.devInviteToken } : {}) };
  }
}
