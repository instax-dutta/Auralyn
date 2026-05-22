import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class JsonSessionStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.cache = null;
  }

  async ensureLoaded() {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.cache = {};
    }

    return this.cache;
  }

  async persist() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.cache, null, 2));
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
