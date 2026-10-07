import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApprovalChain } from './approval-chain.js';
import { AuditService } from './audit.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { TenantDirectory } from './auth/tenant-directory.service.js';
import { TokensService } from './auth/tokens.service.js';
import { CONFIG, loadConfig, type Config } from './config.js';
import { createKms, KMS } from './crypto/envelope.service.js';
import { EnvelopeService } from './crypto/envelope.service.js';
import { Db } from './database/db.service.js';
import { ProblemFilter } from './http/exception.filter.js';
import { IdempotencyInterceptor } from './http/idempotency.interceptor.js';
import { TenantTxInterceptor } from './http/tenant-tx.interceptor.js';
import { OutboxService } from './outbox.service.js';
import { Authz, RbacService, ScopeResolver } from './rbac.service.js';
import { SequencesService } from './sequences.service.js';
import { SettingsService } from './settings.service.js';
import { ConsoleMessaging, MESSAGING, type MessagingProvider } from '../shared/providers/messaging/messaging.provider.js';
import { buildProviders, ChannelRouter } from '../shared/providers/messaging/channels.js';
import { SmtpMessaging } from '../shared/providers/messaging/smtp.provider.js';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService, ApprovalChain,
    ConsoleMessaging,
    { provide: KMS, inject: [CONFIG], useFactory: (cfg: Config) => createKms(cfg) },
    EnvelopeService,
    {
      // One router for every channel. Email goes out over SMTP when configured; SMS, WhatsApp and push use the mock
      // providers unless a real one is configured (see config.ts). The router reports which are mock.
      provide: ChannelRouter, inject: [CONFIG, ConsoleMessaging],
      useFactory: (cfg: Config, console_: ConsoleMessaging) => new ChannelRouter(buildProviders(cfg, cfg.SMTP_URL ? new SmtpMessaging(cfg.SMTP_URL, cfg.MAIL_FROM) : console_)),
    },
    { provide: MESSAGING, useExisting: ChannelRouter },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Order matters: the tenant transaction must wrap idempotency handling.
    { provide: APP_INTERCEPTOR, useClass: TenantTxInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
  exports: [CONFIG, Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService, ApprovalChain, MESSAGING, ChannelRouter, ConsoleMessaging, KMS, EnvelopeService],
})
export class CoreModule {}
