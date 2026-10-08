import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { QueryError } from '@trackrex/schemas';
import { AppError, mapDatabaseError, type FieldError } from '../errors.js';
import { maybeStore } from '../context.js';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = maybeStore()?.requestId;
    const app = this.toAppError(exception);
    if (process.env.DEBUG_ERRORS && app.status >= 500) console.error(exception);
    if (app.status >= 500) this.log.error(`${req.method} ${req.url} -> ${app.status} ${(exception as Error)?.stack ?? exception}`);
    res.status(app.status).type('application/problem+json').json(app.toProblem(requestId, req.originalUrl));
  }

  private toAppError(e: unknown): AppError {
    if (e instanceof AppError) return e;
    if (e instanceof ZodError) {
      const errors: FieldError[] = e.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
      return new AppError(422, 'validation_failed', 'Some fields need attention.', errors);
    }
    if (e instanceof QueryError) return new AppError(400, e.code, e.message);
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code = status === 404 ? 'route_not_found' : status === 413 ? 'payload_too_large' : 'http_error';
      return new AppError(status, code, status === 404 ? 'That endpoint does not exist.' : e.message);
    }
    const mapped = mapDatabaseError(e);
    if (mapped) return mapped;
    return new AppError(500, 'internal_error', 'Something went wrong on our side. Try again, and share the request ID if it keeps happening.');
  }
}
