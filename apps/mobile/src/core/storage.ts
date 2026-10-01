/** The small slice of persistent storage the core needs. The app backs it with the secure store; tests use memory. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string) { this.data.set(key, value); }
  async remove(key: string) { this.data.delete(key); }
}
