/** Larger payloads (selfies) that must outlive the app while they wait to upload. Too big for the secure store. */
export interface BlobStore {
  put(id: string, base64: string): Promise<void>;
  get(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

export class MemoryBlobs implements BlobStore {
  readonly data = new Map<string, string>();
  async put(id: string, v: string) { this.data.set(id, v); }
  async get(id: string) { return this.data.get(id) ?? null; }
  async remove(id: string) { this.data.delete(id); }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
