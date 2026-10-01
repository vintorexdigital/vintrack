import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { Db } from '../database/db.service.js';
import { currentStore } from '../context.js';

/** Wraps every company-realm request in a transaction with RLS context set. */
@Injectable()
export class TenantTxInterceptor implements NestInterceptor {
  constructor(private readonly db: Db) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const store = currentStore();
    const auth = store.auth;
    if (!auth || auth.realm !== 'company' || !auth.tenantId) return next.handle();
    return from(this.db.inTenant(store, auth.tenantId, { userId: auth.userId, employeeId: auth.employeeId }, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
