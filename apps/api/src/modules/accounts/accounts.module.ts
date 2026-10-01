import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CompanyController } from './company.controller.js';
import { CompanyService } from './company.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { OidcService } from './oidc.service.js';
import { OtpService } from './otp.service.js';
import { ProvisioningService } from './provisioning.service.js';
import { SignupController } from './signup.controller.js';

@Module({
  controllers: [AuthController, CompanyController, SignupController],
  providers: [AuthService, OtpService, OidcService, CompanyService, EntitlementsService, ProvisioningService],
  exports: [AuthService, CompanyService, EntitlementsService, ProvisioningService, OidcService],
})
export class AccountsModule {}
