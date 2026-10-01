import { isIP } from 'node:net';

function toBigInt(ip: string): bigint | null {
  const v = isIP(ip);
  if (v === 4) return ip.split('.').reduce((a, o) => (a << 8n) + BigInt(Number(o)), 0n);
  if (v === 6) {
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const full = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
    return full.reduce((a, g) => (a << 16n) + BigInt(parseInt(g || '0', 16)), 0n);
  }
  return null;
}

/** True when `ip` falls in `cidr` (IPv4 or IPv6) or equals a bare address. */
export function inCidr(ip: string, cidr: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const [net, bitsRaw] = cidr.split('/');
  if (!net) return false;
  const v = isIP(net);
  if (isIP(normalized) !== v) return false;
  const a = toBigInt(normalized);
  const b = toBigInt(net);
  if (a === null || b === null) return false;
  const total = v === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? total : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > total) return false;
  const shift = BigInt(total - bits);
  return a >> shift === b >> shift;
}

export function ipAllowed(ip: string | undefined, allowlist: string[], allowAnyWhenEmpty: boolean): boolean {
  if (!allowlist.length) return allowAnyWhenEmpty;
  if (!ip) return false;
  return allowlist.some((c) => inCidr(ip, c));
}
