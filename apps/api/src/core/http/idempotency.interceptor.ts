import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { from, lastValueFrom, of, type Observable } from 'rxjs';
import { Db } from '../database/db.service.js';
import { currentStore } from '../context.js';
import { sha256 } from '../auth/password.js';
import { AppError, badRequest } from '../errors.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Makes retried mutations harmless. The key row is inserted in the same transaction as the work,
 * so a failed attempt leaves no trace and a successful one is replayed verbatim.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const store = currentStore();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (!MUTATING.has(req.method) || !store.tx || !store.auth?.tenantId) return next.handle();
    const key = req.header('idempotency-key');
    if (!key) {
      if (store.source === 'mobile' || store.source === 'desktop') {
        throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header with every change from the app.');
      }
      return next.handle();
    }
    if (key.length > 128) throw badRequest('idempotency_key_invalid', 'The Idempotency-Key is too long.');
    const hash = sha256(`${req.method} ${req.path} ${JSON.stringify(req.body ?? null)}`);
    return from((async () => {
      const inserted = await this.db.q.execute(sql`
        insert into idempotency_keys (tenant_id, key, method, path, request_hash)
        values (${store.tenantId}, ${key}, ${req.method}, ${req.path}, ${hash})
        on conflict (tenant_id, key) do nothing returning key`);
      if (!inserted.rows.length) {
        const prev = (await this.db.q.execute(sql`select request_hash, status_code, response from idempotency_keys where tenant_id = ${store.tenantId} and key = ${key}`)).rows[0] as { request_hash: string; status_code: number | null; response: unknown } | undefined;
        if (!prev || prev.request_hash !== hash) throw new AppError(422, 'idempotency_key_reuse', 'That Idempotency-Key was already used for a different request.');
        if (prev.status_code === null) throw new AppError(409, 'request_in_progress', 'The original request is still running.');
        res.status(prev.status_code);
        res.setHeader('Idempotent-Replay', 'true');
        return prev.response;
      }
      const out = await lastValueFrom(next.handle(), { defaultValue: null });
      await this.db.q.execute(sql`update idempotency_keys set status_code = ${res.statusCode}, response = ${JSON.stringify(out ?? null)}::jsonb where tenant_id = ${store.tenantId} and key = ${key}`);
      return out;
    })()).pipe((o) => o ?? of(null));
  }
}
