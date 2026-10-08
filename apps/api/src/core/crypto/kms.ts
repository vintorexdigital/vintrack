import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * The master-key service. It only ever wraps and unwraps small data keys; bulk data never goes through it.
 * A production deployment points this interface at AWS KMS, GCP KMS or Vault Transit. Only `LocalKms` exists today.
 */
export interface KmsProvider {
  readonly name: string;
  /** Id of the key new data keys are wrapped with. */
  currentKeyId(): string;
  wrap(dek: Buffer, keyId?: string): Promise<{ keyId: string; wrapped: Buffer }>;
  unwrap(keyId: string, wrapped: Buffer): Promise<Buffer>;
}

/**
 * A software stand-in for a cloud KMS: master keys come from the environment (`KMS_MASTER_KEYS=id:base64,id2:base64`,
 * first one is current) and wrapping is AES-256-GCM. This is NOT an HSM: anyone who can read the environment of the
 * API process can read every company's data. It gives the same key hierarchy, rotation and re-wrap behaviour as a
 * cloud KMS so the swap is a provider change, not a data migration.
 */
export class LocalKms implements KmsProvider {
  readonly name = 'local (software, not an HSM)';
  private readonly keys = new Map<string, Buffer>();
  private readonly current: string;

  constructor(spec: string) {
    for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
      const i = part.indexOf(':');
      const id = part.slice(0, i);
      const key = Buffer.from(part.slice(i + 1), 'base64');
      if (i < 1 || key.length !== 32) throw new Error('KMS_MASTER_KEYS entries must look like id:base64 and hold 32 bytes.');
      this.keys.set(id, key);
    }
    if (!this.keys.size) throw new Error('KMS_MASTER_KEYS is empty.');
    this.current = [...this.keys.keys()][0]!;
  }

  currentKeyId() { return this.current; }

  async wrap(dek: Buffer, keyId = this.current) {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown master key ${keyId}.`);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(keyId));
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return { keyId, wrapped: Buffer.concat([iv, c.getAuthTag(), ct]) };
  }

  async unwrap(keyId: string, wrapped: Buffer) {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Master key ${keyId} is not available. Keep retired master keys in KMS_MASTER_KEYS until all data keys are re-wrapped.`);
    const d = createDecipheriv('aes-256-gcm', key, wrapped.subarray(0, 12));
    d.setAAD(Buffer.from(keyId));
    d.setAuthTag(wrapped.subarray(12, 28));
    return Buffer.concat([d.update(wrapped.subarray(28)), d.final()]);
  }
}
