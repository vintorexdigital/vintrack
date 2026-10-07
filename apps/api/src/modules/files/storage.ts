import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

export interface StorageProvider {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
export const STORAGE = Symbol('STORAGE');

/**
 * Files on local disk. Right for development and a single-node deployment with a persistent volume. A multi-node
 * deployment sets STORAGE_DRIVER=s3 and uses `S3Storage` behind the same interface.
 */
export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root))) throw new Error('Invalid storage key.');
    return p;
  }
  async put(key: string, bytes: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string) {
    try { return await readFile(this.path(key)); } catch { return null; }
  }
  async exists(key: string) {
    try { return (await stat(this.path(key))).isFile(); } catch { return false; }
  }
  async delete(key: string) { await rm(this.path(key), { force: true }); }
}

/** In-memory storage for tests. */
export class MemoryStorage implements StorageProvider {
  readonly files = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer) { this.files.set(key, bytes); }
  async get(key: string) { return this.files.get(key) ?? null; }
  async exists(key: string) { return this.files.has(key); }
  async delete(key: string) { this.files.delete(key); }
}
