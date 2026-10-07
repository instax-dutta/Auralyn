import { dataPath } from './data-dir.js';
import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

// Persistent TTL cache for Spotify-track -> YouTube-search resolutions.
// Survives restarts so a redeployed bot doesn't re-search YouTube for the
// same songs. Same on-disk pattern as guild-settings.json.

const DEFAULT_FILE_PATH = dataPath('spotify-yt-cache.json');
const DEFAULT_TTL_MS = 24 * 60 * 60_000;   // 24 hours
const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_PERSIST_DEBOUNCE_MS = 30_000;

export class SpotifyYtCache {
  constructor({
    filePath = DEFAULT_FILE_PATH,
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS,
    logger = null,
  } = {}) {
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.persistDebounceMs = persistDebounceMs;
    this.logger = logger;
    this.cache = new Map();
    this.dirty = false;
    this.persistTimer = null;
  }

  async load() {
    const { value, quarantinedTo } = await readJsonWithQuarantine(this.filePath);

    if (quarantinedTo) {
      this.logger?.warn?.('spotify_yt_cache_quarantined', { filePath: this.filePath, quarantinedTo });
    }

    const now = Date.now();
    let loaded = 0;

    for (const [key, entry] of Object.entries(value && typeof value === 'object' ? value : {})) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) continue;
      if (!entry.value) continue;
      this.cache.set(key, entry);
      loaded += 1;
    }

    this.logger?.info?.('spotify_yt_cache_loaded', { loaded, filePath: this.filePath });
    this._prune();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this._scheduleWrite();
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.cache.size > this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this._scheduleWrite();
  }

  _prune() {
    const now = Date.now();
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(k);
    }
    while (this.cache.size > this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  _scheduleWrite() {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, this.persistDebounceMs);
    this.persistTimer.unref?.();
  }

  /**
 * Merges this instance's live entries into the canonical file inside the file
 * lock, then writes it atomically.
 *
 * The file is re-read under the lock rather than overwritten from the
 * in-memory view, so an entry written by another writer between this
 * instance's last flush and this one is not erased. Expired entries are
 * dropped on both sides, which is the only thing a flush may delete.
 */
async persist() {
    if (!this.dirty) return;
    this.dirty = false;
    this._prune();

    const now = Date.now();

    try {
      await withFileLock(this.filePath, async () => {
        const { value } = await readJsonWithQuarantine(this.filePath);
        const merged = new Map();

        for (const [key, entry] of Object.entries(value && typeof value === 'object' ? value : {})) {
          if (!entry || typeof entry !== 'object') continue;
          if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) continue;
          if (!entry.value) continue;
          merged.set(key, entry);
        }

        for (const [key, entry] of this.cache) {
          if (entry.expiresAt <= now) continue;
          // Re-insert so the newest write sorts last and is evicted last.
          merged.delete(key);
          merged.set(key, entry);
        }

        while (merged.size > this.maxEntries) {
          merged.delete(merged.keys().next().value);
        }

        await writeJsonAtomic(this.filePath, Object.fromEntries(merged));
      });
    } catch (error) {
      this.logger?.warn?.('spotify_yt_cache_persist_failed', {
        filePath: this.filePath,
        code: error?.code ?? null,
      });
      this.dirty = true;
    }
  }

  async flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }

  size() {
    return this.cache.size;
  }
}

let defaultInstance = null;

export function getSpotifyYtCache() {
  if (!defaultInstance) {
    defaultInstance = new SpotifyYtCache();
    void defaultInstance.load();
  }
  return defaultInstance;
}

export function setSpotifyYtCacheInstance(instance) {
  defaultInstance = instance;
}
