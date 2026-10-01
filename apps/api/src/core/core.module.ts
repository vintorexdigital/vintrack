import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { TenantDirectory } from './auth/tenant-directory.service.js';
import { TokensService } from './auth/tokens.service.js';
import { CONFIG, loadConfig } from './config.js';
import { Db } from './database/db.service.js';
import { ProblemFilter } from './http/exception.filter.js';
import { IdempotencyInterceptor } from './http/idempotency.interceptor.js';
import { TenantTxInterceptor } from './http/tenant-tx.interceptor.js';
import { OutboxService } from './outbox.service.js';
import { Authz, RbacService, ScopeResolver } from './rbac.service.js';
import { SequencesService } from './sequences.service.js';
import { SettingsService } from './settings.service.js';
import { ConsoleMessaging, MESSAGING } from '../shared/providers/messaging/messaging.provider.js';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService,
    ConsoleMessaging, { provide: MESSAGING, useExisting: ConsoleMessaging },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Order matters: the tenant transaction must wrap idempotency handling.
    { provide: APP_INTERCEPTOR, useClass: TenantTxInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
  exports: [CONFIG, Db, TokensService, TenantDirectory, RbacService, Authz, ScopeResolver, AuditService, SequencesService, OutboxService, SettingsService, MESSAGING, ConsoleMessaging],
})
export class CoreModule {}
