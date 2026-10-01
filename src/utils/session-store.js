import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

export class JsonSessionStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.cache = null;
  }

  async ensureLoaded() {
    if (this.cache) return this.cache;

    const { value, quarantinedTo } = await readJsonWithQuarantine(this.filePath);

    if (quarantinedTo) {
      this.onQuarantine?.(quarantinedTo);
    }

    this.cache = value && typeof value === 'object' ? value : {};
    return this.cache;
  }

  async persist() {
    await writeJsonAtomic(this.filePath, this.cache);
  }

  async save(guildId, snapshot) {
    await withFileLock(this.filePath, async () => {
      // Re-read inside the lock: another writer may have committed since this
      // instance cached the file, and writing our stale copy would erase it.
      const { value } = await readJsonWithQuarantine(this.filePath);
      const cache = value && typeof value === 'object' ? value : {};
      cache[guildId] = snapshot;
      this.cache = cache;
      await this.persist();
    });
    return snapshot;
  }

  async get(guildId) {
    const cache = await this.ensureLoaded();
    return cache[guildId] ?? null;
  }

  async delete(guildId) {
    await withFileLock(this.filePath, async () => {
      const { value } = await readJsonWithQuarantine(this.filePath);
      const cache = value && typeof value === 'object' ? value : {};
      delete cache[guildId];
      this.cache = cache;
      await this.persist();
    });
  }

  async getAll() {
    const { value } = await readJsonWithQuarantine(this.filePath);
    const cache = value && typeof value === 'object' ? value : {};
    this.cache = cache;
    return { ...cache };
  }
}
