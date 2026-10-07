import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../config.js';
import { currentStore } from '../context.js';
import { Db } from '../database/db.service.js';
import { LocalKms, type KmsProvider } from './kms.js';

export const KMS = Symbol('KMS');
const MAGIC = Buffer.from('TRX1');
const HEADER = 4 + 4 + 12 + 16;
const CACHE_MS = 5 * 60_000;

export const isSealedBytes = (b: Buffer) => b.length > HEADER && b.subarray(0, 4).equals(MAGIC);

/**
 * Seals and opens data with the company's own data key. Sealed form: `TRX1 | key version | iv | tag | ciphertext`,
 * authenticated against the company id and a purpose label, so a value cannot be moved to another company or
 * another field and still open. Data keys are created on first use, kept only wrapped in `tenant_keys`, and cached
 * unwrapped in memory for a few minutes.
 */
@Injectable()
export class EnvelopeService {
  private readonly cache = new Map<string, { version: number; key: Buffer; at: number }>();

  constructor(private readonly db: Db, @Inject(KMS) readonly kms: KmsProvider, @Inject(CONFIG) private readonly cfg: Config) {}

  get enabled() { return this.cfg.ENVELOPE_ENCRYPTION; }

  private tenant(explicit?: string): string {
    const t = explicit ?? currentStore().tenantId;
    if (!t) throw new Error('Encryption needs a company context.');
    return t;
  }

  private forget(tenantId: string) {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${tenantId}:`)) this.cache.delete(k);
  }

  /** Reads (and if needed creates) a key version on its own connection, so a rolled-back request never loses a key that data was sealed with. */
  private async load(tenantId: string, version?: number): Promise<{ version: number; key: Buffer }> {
    const cacheKey = `${tenantId}:${version ?? 'latest'}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    return this.db.runAsTenant(tenantId, {}, async () => {
      const q = this.db.q;
      const fetch = async () => (await q.execute(sql`select version, wrapped_dek, kms_key_id from tenant_keys where tenant_id = ${tenantId}::uuid ${version === undefined ? sql`and retired_at is null` : sql`and version = ${version}`} order by version desc limit 1`)).rows[0] as { version: number; wrapped_dek: string; kms_key_id: string } | undefined;
      let row = await fetch();
      if (!row && version === undefined) {
        const w = await this.kms.wrap(randomBytes(32));
        await q.execute(sql`insert into tenant_keys (tenant_id, version, wrapped_dek, kms_key_id) values (${tenantId}::uuid, 1, ${w.wrapped.toString('base64')}, ${w.keyId}) on conflict do nothing`);
        row = await fetch();
      }
      if (!row) throw new Error(`Data key version ${version} for this company is missing.`);
      const entry = { version: row.version, key: await this.kms.unwrap(row.kms_key_id, Buffer.from(row.wrapped_dek, 'base64')), at: Date.now() };
      this.cache.set(`${tenantId}:${row.version}`, entry);
      if (version === undefined) this.cache.set(cacheKey, entry);
      return entry;
    });
  }

  async seal(purpose: string, plaintext: Buffer, tenantId?: string): Promise<Buffer> {
    const t = this.tenant(tenantId);
    const { version, key } = await this.load(t);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(`${t}|${purpose}`));
    const ct = Buffer.concat([c.update(plaintext), c.final()]);
    const v = Buffer.alloc(4);
    v.writeUInt32BE(version);
    return Buffer.concat([MAGIC, v, iv, c.getAuthTag(), ct]);
  }

  async open(purpose: string, sealed: Buffer, tenantId?: string): Promise<Buffer> {
    const t = this.tenant(tenantId);
    if (!isSealedBytes(sealed)) throw new Error('Not sealed data.');
    const { key } = await this.load(t, sealed.readUInt32BE(4));
    const d = createDecipheriv('aes-256-gcm', key, sealed.subarray(8, 20));
    d.setAAD(Buffer.from(`${t}|${purpose}`));
    d.setAuthTag(sealed.subarray(20, 36));
    return Buffer.concat([d.update(sealed.subarray(36)), d.final()]);
  }

  async sealText(purpose: string, text: string, tenantId?: string) { return (await this.seal(purpose, Buffer.from(text), tenantId)).toString('base64'); }
  async openText(purpose: string, b64: string, tenantId?: string) { return (await this.open(purpose, Buffer.from(b64, 'base64'), tenantId)).toString(); }

  async sealPoint(purpose: string, p: { lat: number; lng: number }, tenantId?: string) { return this.sealText(purpose, JSON.stringify([p.lat, p.lng]), tenantId); }
  async openPoint(purpose: string, b64: string, tenantId?: string): Promise<{ lat: number; lng: number }> {
    const [lat, lng] = JSON.parse(await this.openText(purpose, b64, tenantId)) as [number, number];
    return { lat, lng };
  }

  /** Starts a new data key version for the company. Old versions stay readable; new data uses the new one. */
  async rotate(tenantId?: string): Promise<number> {
    const t = this.tenant(tenantId);
    const out = await this.db.runAsTenant(t, {}, async () => {
      const cur = (await this.db.q.execute(sql`select coalesce(max(version), 0)::int as v from tenant_keys where tenant_id = ${t}::uuid`)).rows[0] as { v: number };
      const dek = randomBytes(32);
      const w = await this.kms.wrap(dek);
      await this.db.q.execute(sql`update tenant_keys set retired_at = now() where tenant_id = ${t}::uuid and retired_at is null`);
      await this.db.q.execute(sql`insert into tenant_keys (tenant_id, version, wrapped_dek, kms_key_id) values (${t}::uuid, ${cur.v + 1}, ${w.wrapped.toString('base64')}, ${w.keyId})`);
      return cur.v + 1;
    });
    this.forget(t);
    return out;
  }

  /** Wraps every data key that is not under the current master key with the current one. Returns how many were re-wrapped. */
  async rewrapAll(tenantId?: string): Promise<number> {
    const t = this.tenant(tenantId);
    return this.db.runAsTenant(t, {}, async () => {
      const rows = (await this.db.q.execute(sql`select version, wrapped_dek, kms_key_id from tenant_keys where tenant_id = ${t}::uuid and kms_key_id <> ${this.kms.currentKeyId()}`)).rows as { version: number; wrapped_dek: string; kms_key_id: string }[];
      for (const r of rows) {
        const dek = await this.kms.unwrap(r.kms_key_id, Buffer.from(r.wrapped_dek, 'base64'));
        const w = await this.kms.wrap(dek);
        await this.db.q.execute(sql`update tenant_keys set wrapped_dek = ${w.wrapped.toString('base64')}, kms_key_id = ${w.keyId} where tenant_id = ${t}::uuid and version = ${r.version}`);
      }
      this.forget(t);
      return rows.length;
    });
  }
}

export function createKms(cfg: Config): KmsProvider {
  return new LocalKms(cfg.KMS_MASTER_KEYS);
}

export const PURPOSE = { locationPoint: 'location.point', liveLocation: 'location.live', employeeHome: 'employee.home', selfie: 'file.selfie', formPhoto: 'file.form' } as const;
