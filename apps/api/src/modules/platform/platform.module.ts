import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { PlatformAuthController, TenantsAdminController } from './platform.controllers.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { TenantsAdminService } from './tenants-admin.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [PlatformAuthController, TenantsAdminController],
  providers: [PlatformAuthService, TenantsAdminService],
  exports: [PlatformAuthService],
})
export class PlatformModule {}
