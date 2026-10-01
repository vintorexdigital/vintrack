import { safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KeyValueStore } from '@trackrex/client-core';

/** A JSON file in the user's app-data folder. Secrets (the refresh token) are encrypted with the OS keychain when it is available. */
export class FileStore implements KeyValueStore {
  private data: Record<string, string>;
  constructor(private readonly file: string) {
    try { this.data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>; } catch { this.data = {}; }
  }
  private save() { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(this.data), { mode: 0o600 }); }
  private secret(key: string) { return key === 'trk.refresh'; }
  async get(key: string) {
    const v = this.data[key];
    if (v === undefined) return null;
    if (this.secret(key) && safeStorage.isEncryptionAvailable()) { try { return safeStorage.decryptString(Buffer.from(v, 'base64')); } catch { return null; } }
    return v;
  }
  async set(key: string, value: string) {
    this.data[key] = this.secret(key) && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value).toString('base64') : value;
    this.save();
  }
  async remove(key: string) { delete this.data[key]; this.save(); }
}
