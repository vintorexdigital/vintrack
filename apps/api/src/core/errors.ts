import type { Problem } from '@trackrex/schemas';

export interface FieldError {
  path: string;
  message: string;
  code?: string;
}

/** Domain error with a stable machine code; the global filter renders it as RFC 9457 problem details. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
  }
  toProblem(requestId?: string, instance?: string): Problem {
    return {
      type: `https://trackrex.app/problems/${this.code}`,
      title: TITLES[this.status] ?? 'Error',
      status: this.status,
      code: this.code,
      detail: this.message,
      ...(instance ? { instance } : {}),
      ...(requestId ? { requestId } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

const TITLES: Record<number, string> = {
  400: 'Bad request', 401: 'Not signed in', 402: 'Not licensed', 403: 'Not allowed', 404: 'Not found',
  409: 'Conflict', 422: 'Validation failed', 423: 'Locked', 429: 'Too many requests', 500: 'Server error',
};

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = 'Sign in to continue.', code = 'unauthorized') => new AppError(401, code, message);
export const notLicensed = (module: string) => new AppError(402, 'module_not_licensed', `Your plan does not include ${module}.`);
export const forbidden = (message = 'You do not have permission to do that.', code = 'forbidden') => new AppError(403, code, message);
export const notFound = (what = 'Record') => new AppError(404, 'not_found', `${what} was not found.`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unprocessable = (message: string, errors?: FieldError[], code = 'validation_failed') => new AppError(422, code, message, errors);
export const tooMany = (message = 'Too many attempts. Try again shortly.') => new AppError(429, 'rate_limited', message);

export function mapDatabaseError(e: unknown): AppError | null {
  const raw = e as { code?: string; cause?: unknown };
  // Drizzle wraps driver errors; the Postgres error is on `cause`.
  const err = ((raw?.cause && (raw.cause as { code?: string }).code ? raw.cause : e) as { code?: string; constraint?: string; detail?: string; table?: string; message?: string });
  switch (err?.code) {
    case '23505':
      return conflict('duplicate', duplicateMessage(err.constraint));
    case '23503':
      return conflict('invalid_reference', 'This record is linked to another record that no longer exists, or is still in use.');
    case '23514':
      return unprocessable('A value is not allowed for this field.', undefined, 'constraint_violation');
    case '23502':
      return unprocessable('A required value is missing.', undefined, 'missing_value');
    case '22P02':
    case '22007':
    case '22008':
      return badRequest('invalid_value', 'A value has the wrong format.');
    case '42501':
      return forbidden('This change is outside your company.', 'tenant_violation');
    default:
      return null;
  }
}

function duplicateMessage(constraint?: string): string {
  if (!constraint) return 'That value already exists.';
  const m = /^(.+?)_(.+)_uq$/.exec(constraint);
  if (m) return `A record with that ${m[2]!.replace(/_/g, ' ')} already exists.`;
  return 'That value already exists.';
}
