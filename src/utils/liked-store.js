import { mkdir } from 'node:fs/promises';
import { dataPath } from './data-dir.js';
import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

export class LikedStore {
  constructor({ logger } = {}) {
    this.cache = new Map();
    this.logger = logger;
  }

  getUserFilePath(userId) {
    return dataPath('liked', `${userId}.json`);
  }

  async _load(userId) {
    // Always re-read: a cached view cannot see another store instance's write.
    const { value, quarantinedTo } = await readJsonWithQuarantine(this.getUserFilePath(userId));

    if (quarantinedTo) {
      this.logger?.warn?.('liked_quarantined', { userId, quarantinedTo });
    }

    const data = value && typeof value === 'object' && Array.isArray(value.songs)
      ? value
      : { songs: [] };

    this.cache.set(userId, data);
    return data;
  }

  /**
   * Applies `mutate` to the user's canonical file inside the per-user lock and
   * writes it atomically, so two store instances cannot erase each other's
   * liked songs. `mutate` may return `false` to report "nothing changed",
   * which skips the write entirely.
   */
  async _mutate(userId, mutate) {
    const filePath = this.getUserFilePath(userId);
    await mkdir(dataPath('liked'), { recursive: true });

    return withFileLock(filePath, async () => {
      const { value } = await readJsonWithQuarantine(filePath);
      const current = value && typeof value === 'object' && Array.isArray(value.songs)
        ? value
        : { songs: [] };

      const outcome = await mutate(current);
      if (outcome === false) return current;

      await writeJsonAtomic(filePath, current);
      this.cache.set(userId, current);
      return current;
    });
  }

  async getLikedSongs(userId) {
    const data = await this._load(userId);
    return data.songs;
  }

  async likeTrack(userId, track) {
    const uri = track.info?.uri;
    if (!uri) return false;

    let added = false;

    await this._mutate(userId, current => {
      if (current.songs.some(song => song.uri === uri)) return false;

      current.songs.unshift({
        encoded: track.encoded,
        title: track.info?.title ?? 'Unknown',
        uri,
        duration: track.info?.length ?? 0,
        addedAt: new Date().toISOString(),
      });
      added = true;
    });

    return added;
  }

  async unlikeTrack(userId, uri) {
    let removed = false;

    await this._mutate(userId, current => {
      const before = current.songs.length;
      current.songs = current.songs.filter(song => song.uri !== uri);
      if (current.songs.length === before) return false;
      removed = true;
    });

    return removed;
  }

  async clearLikedSongs(userId) {
    let count = 0;

    await this._mutate(userId, current => {
      count = current.songs.length;
      current.songs = [];
    });

    return count;
  }

  async sortLikedSongs(userId, key) {
    return this._mutate(userId, current => {
      if (key === 'title') {
        current.songs.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
      } else if (key === 'duration') {
        current.songs.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
      } else if (key === 'date_added') {
        current.songs.sort((a, b) => new Date(b.addedAt ?? 0) - new Date(a.addedAt ?? 0));
      } else {
        throw new Error(`Unknown sort key: ${key}`);
      }
      return current;
    }).then(data => data.songs);
  }
}