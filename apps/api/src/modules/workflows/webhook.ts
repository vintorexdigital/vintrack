import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isPrivateHost } from '@trackrex/rules';

/** Per-company key a receiver uses to check that a call came from Trackrex. Derived, so it needs no storage; shown to admins. */
export const webhookSecret = (serverSecret: string, tenantId: string): string => createHmac('sha256', serverSecret).update(`workflow-webhook:${tenantId}`).digest('hex').slice(0, 40);

export interface SafeOptions { allowPrivate: boolean; timeoutMs?: number; fetchFn?: typeof fetch }

/**
 * Calls a company-supplied address from the server, so it must not become a way into our own network: https only,
 * no loopback/private/link-local/metadata addresses (checked on the name and on what it resolves to), no redirects,
 * a short timeout. Known limit: the name is resolved once to check and again to connect, so a hostile DNS server
 * could still answer differently the second time; run the worker with egress rules that block private ranges too.
 */
export async function callWebhook(url: string, body: string, headers: Record<string, string>, o: SafeOptions): Promise<{ status: number }> {
  const u = new URL(url);
  if (!o.allowPrivate) {
    if (u.protocol !== 'https:') throw new Error('Webhooks must use https.');
    if (isPrivateHost(u.hostname)) throw new Error('That address is not allowed.');
    if (!/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(':')) {
      const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
      if (!addrs.length) throw new Error('That address could not be found.');
      if (addrs.some((a) => isPrivateHost(a.address))) throw new Error('That address is not allowed.');
    }
  }
  const res = await (o.fetchFn ?? fetch)(u, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, redirect: 'manual', signal: AbortSignal.timeout(o.timeoutMs ?? 5000) });
  if (res.status >= 300) throw new Error(`The receiver answered ${res.status}.`);
  return { status: res.status };
}
