/* Workflow rules: pure, shared by the API (which runs workflows) and the console (which previews them). */

export type ConditionOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'exists';
export interface Condition {
  /** Dotted path into the event context, for example `payload.amount` or `employee.departmentId`. */
  path: string;
  op: ConditionOp;
  value?: unknown;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export function matches(c: Condition, ctx: unknown): boolean {
  const actual = getPath(ctx, c.path);
  switch (c.op) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'eq': return actual === c.value || (num(actual) !== null && num(actual) === num(c.value)) || String(actual) === String(c.value);
    case 'ne': return !matches({ ...c, op: 'eq' }, ctx);
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = num(actual);
      const b = num(c.value);
      if (a === null || b === null) return false;
      return c.op === 'gt' ? a > b : c.op === 'gte' ? a >= b : c.op === 'lt' ? a < b : a <= b;
    }
    case 'contains': return typeof actual === 'string' ? actual.toLowerCase().includes(String(c.value ?? '').toLowerCase()) : Array.isArray(actual) && actual.map(String).includes(String(c.value));
    case 'in': return Array.isArray(c.value) && c.value.map(String).includes(String(actual));
  }
}

/** All conditions must hold. An empty list always holds. */
export function evaluateConditions(conditions: Condition[], ctx: unknown): { ok: boolean; failed?: Condition } {
  for (const c of conditions) if (!matches(c, ctx)) return { ok: false, failed: c };
  return { ok: true };
}

/** `{{path}}` placeholders. Unknown paths become empty text; values are never evaluated as code. */
export function renderTemplate(template: string, ctx: unknown): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(ctx, path);
    return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

/** True when the hostname is a literal address or name that must never be called from the server (loopback, private ranges, link-local, metadata). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local') || h === 'metadata.google.internal') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}
