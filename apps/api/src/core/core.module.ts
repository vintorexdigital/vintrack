import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { SmtpMessaging } from '../shared/providers/messaging/smtp.provider.js';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService,
    ConsoleMessaging,
    { provide: KMS, inject: [CONFIG], useFactory: (cfg: Config) => createKms(cfg) },
    EnvelopeService,
    {
      provide: MESSAGING, inject: [CONFIG, ConsoleMessaging],
      useFactory: (cfg: Config, console_: ConsoleMessaging): MessagingProvider => {
        if (!cfg.SMTP_URL) return console_;
        const smtp = new SmtpMessaging(cfg.SMTP_URL, cfg.MAIL_FROM);
        // Email goes out for real; channels with no adapter yet stay in the log.
        return { send: (m) => (m.channel === 'email' ? smtp.send(m) : console_.send(m)) };
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Order matters: the tenant transaction must wrap idempotency handling.
    { provide: APP_INTERCEPTOR, useClass: TenantTxInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
  exports: [CONFIG, Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService, MESSAGING, ConsoleMessaging, KMS, EnvelopeService],
})
export class CoreModule {}
