import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { AllowWhenSuspended } from '../../core/auth/decorators.js';
import { idParam, uuid } from '@trackrex/schemas';
import { CompanyService } from './company.service.js';

@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get() profile() { return this.company.profile(); }
  @Patch() update(@Body() body: unknown) { return this.company.updateProfile(body); }

  @Get('support-access')
  async supportAccess() { return { session: await this.company.activeSupportSession(), history: await this.company.supportSessions().catch(() => []) }; }
  @Put('support-access') @HttpCode(200)
  setSupport(@Body() body: unknown) { return this.company.setSupportAccess(z.object({ enabled: z.boolean() }).parse(body).enabled); }

  @Get('roles') roles() { return this.company.roleCatalogue(); }

  @Get('members') members() { return this.company.members(); }
  @Patch('members/:id') updateMember(@Param() p: unknown, @Body() body: unknown) { return this.company.updateMember(idParam.parse(p).id, body); }

  @Get('invitations') invitations() { return this.company.listInvitations(); }
  @Post('invitations') invite(@Body() body: unknown) { return this.company.invite(body); }
  @Delete('invitations/:id') @HttpCode(204) async revoke(@Param() p: unknown) { await this.company.revokeInvitation(idParam.parse(p).id); }

  @Post('ownership-transfer') startTransfer(@Body() body: unknown) { return this.company.startOwnershipTransfer(z.object({ toMembershipId: uuid }).parse(body).toMembershipId); }
  @Post('ownership-transfer/:id/accept') @HttpCode(200) @AllowWhenSuspended() accept(@Param() p: unknown) { return this.company.resolveOwnershipTransfer(idParam.parse(p).id, true); }
  @Post('ownership-transfer/:id/decline') @HttpCode(200) decline(@Param() p: unknown) { return this.company.resolveOwnershipTransfer(idParam.parse(p).id, false); }
}
