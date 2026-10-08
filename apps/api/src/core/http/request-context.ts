import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { als, type Store } from '../context.js';

/** Opens the per-request store. Guards and interceptors fill in auth and the transaction. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID();
  const client = (req.headers['x-client'] as string | undefined) ?? 'web';
  const source = (['web', 'mobile', 'desktop', 'api'] as const).find((s) => s === client) ?? 'web';
  const store: Store = { requestId, ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300), source };
  res.setHeader('x-request-id', requestId);
  als.run(store, next);
}
