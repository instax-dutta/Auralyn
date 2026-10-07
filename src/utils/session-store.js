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

/**
 * The on-disk shape is `{ sessions: { [guildId]: envelope }, stopped: { [guildId]: iso } }`.
 * A pre-tombstone file is a bare `{ [guildId]: envelope }` map, so it is lifted
 * into `sessions` on read. `stopped` is treated as untrusted: a corrupt value
 * becomes an empty record rather than blocking session reads.
 */
function normaliseStoreFile(value) {
  const sessions = {};
  let stopped = {};

  if (value && typeof value === 'object') {
    if (value.sessions && typeof value.sessions === 'object') {
      Object.assign(sessions, value.sessions);
    } else {
      // Legacy bare map: every entry is a session envelope.
      for (const [guildId, entry] of Object.entries(value)) {
        if (guildId === 'stopped' || guildId === 'sessions') continue;
        if (entry && typeof entry === 'object') sessions[guildId] = entry;
      }
    }

    if (value.stopped && typeof value.stopped === 'object' && !Array.isArray(value.stopped)) {
      stopped = value.stopped;
    }
  }

  return { sessions, stopped };
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

    this.cache = normaliseStoreFile(value).sessions;
    return this.cache;
  }

  async save(guildId, snapshot) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    await withFileLock(this.filePath, async () => {
      // Re-read inside the lock: another writer may have committed since this
      // instance cached the file, and writing our stale copy would erase it.
      const { value } = await readJsonWithQuarantine(this.filePath);
      const file = normaliseStoreFile(value);
      const current = file.sessions[guildId];

      // A writer that observed an older snapshot than what is now stored must
      // not win, or a slow shard silently rolls a guild's queue back.
      if (isOlder(snapshot?.updatedAt, current?.updatedAt)) {
        throw new StaleRevisionError(guildId, {
          storedAt: current.updatedAt,
          attemptedAt: snapshot.updatedAt,
        });
      }

      file.sessions[guildId] = {
        ...snapshot,
        revision: (typeof current?.revision === 'number' ? current.revision : 0) + 1,
      };

      // New playback means the guild is no longer intentionally stopped.
      delete file.stopped[guildId];

      this.cache = file.sessions;
      await writeJsonAtomic(this.filePath, file);
    });

    return this.cache[guildId];
  }

  async get(guildId) {
    // Always re-read: a cached view can never see another shard's writes, and a
    // guild's session is read far less often than it is written.
    const { value } = await readJsonWithQuarantine(this.filePath);
    this.cache = normaliseStoreFile(value).sessions;
    return this.cache[guildId] ?? null;
  }

  async delete(guildId) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    await withFileLock(this.filePath, async () => {
      const { value } = await readJsonWithQuarantine(this.filePath);
      const file = normaliseStoreFile(value);

      delete file.sessions[guildId];
      // Record the destructive stop so a restart can tell "stopped on purpose"
      // apart from "never played", instead of both simply being absent.
      file.stopped[guildId] = new Date().toISOString();

      this.cache = file.sessions;
      await writeJsonAtomic(this.filePath, file);
    });
  }

  /**
   * Guilds whose most recent outcome was a destructive stop.
   */
  /**
   * Lifts a pre-envelope sessions file into the `{ sessions, stopped }` shape.
 *
 * * A bare `{ [guildId]: envelope }` map is the pre-envelope layout. Entries are
 * * only lifted when the file has no `sessions` key, so an already-migrated file
 * * is left alone and the call is idempotent. Existing entries keep their
 * * revision, so migration never rewrites a session that has already been
 * * written in the new shape. The source file is never deleted.
   */
  async migrateLegacySessions() {
    const { value } = await readJsonWithQuarantine(this.filePath);
    const raw = value && typeof value === 'object' ? value : {};

    // Already migrated, or nothing to do.
    if (raw.sessions && typeof raw.sessions === 'object') return { migrated: 0, skipped: Object.keys(raw.sessions).length };

    await mkdir(path.dirname(this.filePath), { recursive: true });

    return withFileLock(this.filePath, async () => {
      const { value: fresh } = await readJsonWithQuarantine(this.filePath);
      const current = fresh && typeof fresh === 'object' ? fresh : {};
      if (current.sessions && typeof current.sessions === 'object') {
        return { migrated: 0, skipped: Object.keys(current.sessions).length };
      }

      const sessions = {};
      let skipped = 0;
      let migrated = 0;

      for (const [guildId, envelope] of Object.entries(current)) {
        if (guildId === 'stopped' || guildId === 'sessions') continue;
        if (!envelope || typeof envelope !== 'object') continue;

        sessions[guildId] = {
          ...envelope,
          revision: typeof envelope.revision === 'number' ? envelope.revision : 1,
        };
        migrated += 1;
      }

      this.cache = sessions;
      await writeJsonAtomic(this.filePath, { sessions, stopped: current.stopped ?? {} });

      return { migrated, skipped };
    });
  }

  async wasStopped(guildId) {
    const { value } = await readJsonWithQuarantine(this.filePath);
    return guildId in normaliseStoreFile(value).stopped;
  }

  async getAll() {
    const { value } = await readJsonWithQuarantine(this.filePath);
    const file = normaliseStoreFile(value);
    this.cache = file.sessions;
    return { ...file.sessions };
  }
}
