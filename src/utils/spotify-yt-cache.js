import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Persistent TTL cache for Spotify-track -> YouTube-search resolutions.
// Survives restarts so a redeployed bot doesn't re-search YouTube for the
// same songs. Same on-disk pattern as guild-settings.json.

const DEFAULT_FILE_PATH = '/app/data/spotify-yt-cache.json';
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
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const now = Date.now();
      let loaded = 0;
      for (const [key, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== 'object') continue;
        if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) continue;
        if (!entry.value) continue;
        this.cache.set(key, entry);
        loaded += 1;
      }
      this.logger?.info?.(`[spotify-yt-cache] loaded ${loaded} entries from ${this.filePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger?.warn?.(`[spotify-yt-cache] failed to load: ${error.message}`);
      }
    }
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

  async persist() {
    if (!this.dirty) return;
    this.dirty = false;
    this._prune();
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      const payload = Object.fromEntries(this.cache);
      await writeFile(tmp, JSON.stringify(payload));
      await rename(tmp, this.filePath);
    } catch (error) {
      this.logger?.warn?.(`[spotify-yt-cache] failed to persist: ${error.message}`);
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
