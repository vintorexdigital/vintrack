import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    await hashPassword(password); // equalise timing for unknown users
    return false;
  }
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface PasswordPolicy {
  minLength: number;
  requireNumber: boolean;
  requireMixedCase: boolean;
}
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 10, requireNumber: true, requireMixedCase: true };

export function passwordProblems(pw: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string[] {
  const out: string[] = [];
  if (pw.length < policy.minLength) out.push(`Use at least ${policy.minLength} characters.`);
  if (policy.requireNumber && !/\d/.test(pw)) out.push('Include a number.');
  if (policy.requireMixedCase && !(/[a-z]/.test(pw) && /[A-Z]/.test(pw))) out.push('Mix upper and lower case letters.');
  return out;
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, s: string): string => createHmac('sha256', secret).update(s).digest('hex');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
