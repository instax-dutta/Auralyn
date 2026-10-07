import { mkdir } from 'node:fs/promises';
import { dataPath } from './data-dir.js';
import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

const PLAYLIST_MAX_COUNT = parseInt(process.env.PLAYLIST_MAX_COUNT ?? '25', 10);
const PLAYLIST_MAX_TRACKS = parseInt(process.env.PLAYLIST_MAX_TRACKS ?? '500', 10);

const toStoredTrack = (track, addedAt = new Date().toISOString()) => ({
  encoded: track.encoded,
  title: track.info?.title ?? 'Unknown',
  uri: track.info?.uri ?? null,
  duration: track.info?.length ?? 0,
  addedAt,
});

export class PlaylistStore {
  constructor({ logger } = {}) {
    this.cache = new Map();
    this.logger = logger;
  }

  getUserFilePath(userId) {
    return dataPath('playlists', `${userId}.json`);
  }

  async _load(userId) {
    // Always re-read: a cached view cannot see another store instance's write.
    const { value, quarantinedTo } = await readJsonWithQuarantine(this.getUserFilePath(userId));

    if (quarantinedTo) {
      this.logger?.warn?.('playlists_quarantined', { userId, quarantinedTo });
    }

    const data = value && typeof value === 'object' && value.playlists
      ? value
      : { playlists: {} };

    this.cache.set(userId, data);
    return data;
  }

  /**
   * Applies `mutate` to the user's canonical file inside the per-user lock and
   * writes it atomically.
   *
   * The mutation runs against freshly-read data rather than a view loaded
   * earlier, so two store instances targeting the same user cannot erase each
   * other's playlists. Validation inside `mutate` therefore also sees the real
   * current state.
   */
  async _mutate(userId, mutate) {
    const filePath = this.getUserFilePath(userId);
    await mkdir(dataPath('playlists'), { recursive: true });

    return withFileLock(filePath, async () => {
      const { value } = await readJsonWithQuarantine(filePath);
      const current = value && typeof value === 'object' && value.playlists ? value : { playlists: {} };
      const updated = await mutate(current);
      await writeJsonAtomic(filePath, updated);
      this.cache.set(userId, updated);
      return updated;
    });
  }

  static requirePlaylist(data, name) {
    const playlist = data.playlists[name];
    if (!playlist) throw new Error(`Playlist "${name}" does not exist.`);
    return playlist;
  }

  async getPlaylists(userId) {
    const data = await this._load(userId);
    return Object.values(data.playlists);
  }

  async getPlaylist(userId, name) {
    const data = await this._load(userId);
    return data.playlists[name] ?? null;
  }

  async createPlaylist(userId, name, coverUrl = null) {
    const created = {
      name,
      coverUrl,
      createdAt: new Date().toISOString(),
      tracks: [],
    };

    const next = await this._mutate(userId, current => {
      if (current.playlists[name]) throw new Error(`Playlist "${name}" already exists.`);
      if (Object.keys(current.playlists).length >= PLAYLIST_MAX_COUNT) {
        throw new Error(`Playlist limit reached (${PLAYLIST_MAX_COUNT}). Delete one first.`);
      }
      current.playlists[name] = created;
      return current;
    });

    return next.playlists[name];
  }

  async deletePlaylist(userId, name) {
    await this._mutate(userId, current => {
      PlaylistStore.requirePlaylist(current, name);
      delete current.playlists[name];
      return current;
    });
  }

  async addTrackToPlaylist(userId, name, track) {
    const next = await this._mutate(userId, current => {
      const playlist = PlaylistStore.requirePlaylist(current, name);
      if (playlist.tracks.length >= PLAYLIST_MAX_TRACKS) {
        throw new Error(`Playlist "${name}" is full (${PLAYLIST_MAX_TRACKS} tracks max).`);
      }
      playlist.tracks.push(toStoredTrack(track));
      return current;
    });

    return next.playlists[name];
  }

  async removeTrackFromPlaylist(userId, name, position) {
    const next = await this._mutate(userId, current => {
      const playlist = PlaylistStore.requirePlaylist(current, name);
      if (position < 1 || position > playlist.tracks.length) {
        throw new Error(`Invalid position ${position}. Playlist has ${playlist.tracks.length} tracks.`);
      }
      playlist.tracks.splice(position - 1, 1);
      return current;
    });

    return next.playlists[name];
  }

  async setPlaylistCover(userId, name, coverUrl) {
    const next = await this._mutate(userId, current => {
      const playlist = PlaylistStore.requirePlaylist(current, name);
      playlist.coverUrl = coverUrl;
      return current;
    });

    return next.playlists[name];
  }

  async saveQueueToPlaylist(userId, name, tracks) {
    const next = await this._mutate(userId, current => {
      const playlist = PlaylistStore.requirePlaylist(current, name);
      const available = PLAYLIST_MAX_TRACKS - playlist.tracks.length;
      if (tracks.length > available) {
        throw new Error(`Cannot add ${tracks.length} tracks. Only ${available} slots remaining.`);
      }
      const now = new Date().toISOString();
      for (const track of tracks) {
        playlist.tracks.push(toStoredTrack(track, now));
      }
      return current;
    });

    return next.playlists[name];
  }
}