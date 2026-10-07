import { createHash, createHmac } from 'node:crypto';
import type { StorageProvider } from './storage.js';

export interface S3Options {
  endpoint: string;           // for example https://s3.ap-south-1.amazonaws.com or http://minio:9000
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Put the bucket in the path (MinIO and most self-hosted stores) rather than the host name (AWS). */
  pathStyle?: boolean;
  fetch?: typeof fetch;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** AWS Signature V4 for one request. Exported so the test double can verify signatures independently of the signer's own code paths. */
export function signV4(o: { method: string; host: string; path: string; region: string; accessKeyId: string; secretAccessKey: string; payloadHash: string; now: Date; service?: string }) {
  const amz = o.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amz.slice(0, 8);
  const service = o.service ?? 's3';
  const canonicalHeaders = `host:${o.host}\nx-amz-content-sha256:${o.payloadHash}\nx-amz-date:${amz}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [o.method, o.path, '', canonicalHeaders, signedHeaders, o.payloadHash].join('\n');
  const scope = `${date}/${o.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, date), o.region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    'x-amz-date': amz,
    'x-amz-content-sha256': o.payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * S3-compatible object storage (AWS S3, MinIO, R2, and similar), speaking the REST API directly with Signature V4
 * so there is no SDK to carry. Tested against an in-process S3 double that verifies the signature; it has not been
 * run against AWS itself. Objects are addressed by the same keys the local-disk provider uses.
 */
export class S3Storage implements StorageProvider {
  private readonly f: typeof fetch;
  constructor(private readonly o: S3Options) { this.f = o.fetch ?? ((...a) => fetch(...a)); }

  private target(key: string) {
    const url = new URL(this.o.endpoint);
    const objectPath = key.split('/').map(enc).join('/');
    if (this.o.pathStyle) return { host: url.host, path: `/${enc(this.o.bucket)}/${objectPath}`, origin: url.origin };
    return { host: `${this.o.bucket}.${url.host}`, path: `/${objectPath}`, origin: `${url.protocol}//${this.o.bucket}.${url.host}` };
  }

  private async call(method: 'PUT' | 'GET' | 'HEAD', key: string, body?: Buffer) {
    if (key.includes('..') || key.startsWith('/')) throw new Error('Invalid storage key.');
    const t = this.target(key);
    const headers = signV4({ method, host: t.host, path: t.path, region: this.o.region, accessKeyId: this.o.accessKeyId, secretAccessKey: this.o.secretAccessKey, payloadHash: sha256(body ?? ''), now: new Date() });
    return this.f(`${t.origin}${t.path}`, { method, headers: { ...headers, ...(body ? { 'content-length': String(body.length) } : {}) }, body: body ? new Uint8Array(body) : undefined });
  }

  async put(key: string, bytes: Buffer) {
    const r = await this.call('PUT', key, bytes);
    if (!r.ok) throw new Error(`Object store refused the upload (${r.status}).`);
  }
  async get(key: string) {
    const r = await this.call('GET', key);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Object store read failed (${r.status}).`);
    return Buffer.from(await r.arrayBuffer());
  }
  async exists(key: string) {
    const r = await this.call('HEAD', key);
    if (r.status === 404) return false;
    if (!r.ok) throw new Error(`Object store lookup failed (${r.status}).`);
    return true;
  }
}
