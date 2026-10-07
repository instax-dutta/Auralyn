import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

export class StaleRevisionError extends Error {
  constructor(guildId, { storedAt, attemptedAt } = {}) {
    super(`Refusing to write a stale session for guild ${guildId}`);
    this.name = 'StaleRevisionError';
    this.code = 'STALE_REVISION';
    this.guildId = guildId;
    this.storedAt = storedAt ?? null;
    this.attemptedAt = attemptedAt ?? null;
  }
}

function isOlder(attemptedAt, storedAt) {
  if (typeof attemptedAt !== 'string' || typeof storedAt !== 'string') return false;
  const a = Date.parse(attemptedAt);
  const b = Date.parse(storedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a < b;
}

export class JsonSessionStore {
  constructor({ filePath, tombstonePath }) {
    this.filePath = filePath;
    this.tombstonePath = tombstonePath ?? `${filePath}.tombstones.json`;
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
    await mkdir(path.dirname(this.filePath), { recursive: true });

    await withFileLock(this.filePath, async () => {
      // Re-read inside the lock: another writer may have committed since this
      // instance cached the file, and writing our stale copy would erase it.
      const { value } = await readJsonWithQuarantine(this.filePath);
      const cache = value && typeof value === 'object' ? value : {};
      const current = cache[guildId];

      // A writer that observed an older snapshot than what is now stored must
      // not win, or a slow shard silently rolls a guild's queue back.
      if (isOlder(snapshot?.updatedAt, current?.updatedAt)) {
        throw new StaleRevisionError(guildId, {
          storedAt: current.updatedAt,
          attemptedAt: snapshot.updatedAt,
        });
      }

      cache[guildId] = {
        ...snapshot,
        revision: (typeof current?.revision === 'number' ? current.revision : 0) + 1,
      };

      this.cache = cache;
      await this.persist();
    });

    return this.cache[guildId];
  }

  async get(guildId) {
    const cache = await this.ensureLoaded();
    return cache[guildId] ?? null;
  }

  async delete(guildId) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
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
