import { AsyncLocalStorage } from 'node:async_hooks';
import type { Source } from '@trackrex/schemas';
import type { PoolClient } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Scope = 'all' | 'department' | 'location' | 'team' | 'reportees' | 'direct' | 'self';
export const SCOPE_ORDER: Scope[] = ['self', 'direct', 'reportees', 'team', 'department', 'location', 'all'];

export interface AuthContext {
  realm: 'company' | 'platform';
  userId: string;
  /** Company realm */
  tenantId?: string;
  membershipId?: string;
  employeeId?: string | null;
  roleKeys: string[];
  isOwner?: boolean;
  /** Permission key to widest data scope. */
  permissions: Map<string, Scope>;
  /** Present when a platform staff member is acting inside a tenant through a support session. */
  support?: { sessionId: string; staffId: string };
  /** Platform realm */
  platformRole?: string;
}

export type Tx = NodePgDatabase<Record<string, never>>;

export interface Store {
  requestId: string;
  ip: string | undefined;
  userAgent: string | undefined;
  source: Source;
  auth?: AuthContext;
  tx?: Tx;
  client?: PoolClient;
  tenantId?: string;
}

export const als = new AsyncLocalStorage<Store>();

export function currentStore(): Store {
  const s = als.getStore();
  if (!s) throw new Error('No request context. Wrap the call in runWithStore or run it inside a request.');
  return s;
}

export function currentAuth(): AuthContext {
  const a = currentStore().auth;
  if (!a) throw new Error('No authenticated user in context.');
  return a;
}

export function maybeStore(): Store | undefined {
  return als.getStore();
}
