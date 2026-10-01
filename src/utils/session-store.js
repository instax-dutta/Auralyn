import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';

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
    const cache = await this.ensureLoaded();
    cache[guildId] = snapshot;
    await this.persist();
    return snapshot;
  }

  async get(guildId) {
    const cache = await this.ensureLoaded();
    return cache[guildId] ?? null;
  }

  async delete(guildId) {
    const cache = await this.ensureLoaded();
    delete cache[guildId];
    await this.persist();
  }

  async getAll() {
    return { ...(await this.ensureLoaded()) };
  }
}
