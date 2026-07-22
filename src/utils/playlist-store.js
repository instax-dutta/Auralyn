import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dataPath } from './data-dir.js';

const PLAYLIST_MAX_COUNT = parseInt(process.env.PLAYLIST_MAX_COUNT ?? '25', 10);
const PLAYLIST_MAX_TRACKS = parseInt(process.env.PLAYLIST_MAX_TRACKS ?? '500', 10);

export class PlaylistStore {
  constructor() {
    this.cache = new Map();
  }

  getUserFilePath(userId) {
    return dataPath('playlists', `${userId}.json`);
  }

  _loadSync(userId) {
    const filePath = this.getUserFilePath(userId);
    if (!existsSync(filePath)) {
      return { playlists: {} };
    }
    try {
      const raw = readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { playlists: {} };
    }
  }

  async _load(userId) {
    if (this.cache.has(userId)) return this.cache.get(userId);

    const filePath = this.getUserFilePath(userId);
    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      this.cache.set(userId, data);
      return data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const empty = { playlists: {} };
      this.cache.set(userId, empty);
      return empty;
    }
  }

  async _persist(userId, data) {
    const filePath = this.getUserFilePath(userId);
    await mkdir(dataPath('playlists'), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2));
    this.cache.set(userId, data);
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
    const data = await this._load(userId);
    if (data.playlists[name]) {
      throw new Error(`Playlist "${name}" already exists.`);
    }
    if (Object.keys(data.playlists).length >= PLAYLIST_MAX_COUNT) {
      throw new Error(`Playlist limit reached (${PLAYLIST_MAX_COUNT}). Delete one first.`);
    }
    data.playlists[name] = {
      name,
      coverUrl,
      createdAt: new Date().toISOString(),
      tracks: [],
    };
    await this._persist(userId, data);
    return data.playlists[name];
  }

  async deletePlaylist(userId, name) {
    const data = await this._load(userId);
    if (!data.playlists[name]) {
      throw new Error(`Playlist "${name}" does not exist.`);
    }
    delete data.playlists[name];
    await this._persist(userId, data);
  }

  async addTrackToPlaylist(userId, name, track) {
    const data = await this._load(userId);
    const playlist = data.playlists[name];
    if (!playlist) {
      throw new Error(`Playlist "${name}" does not exist.`);
    }
    if (playlist.tracks.length >= PLAYLIST_MAX_TRACKS) {
      throw new Error(`Playlist "${name}" is full (${PLAYLIST_MAX_TRACKS} tracks max).`);
    }
    playlist.tracks.push({
      encoded: track.encoded,
      title: track.info?.title ?? 'Unknown',
      uri: track.info?.uri ?? null,
      duration: track.info?.length ?? 0,
      addedAt: new Date().toISOString(),
    });
    await this._persist(userId, data);
    return playlist;
  }

  async removeTrackFromPlaylist(userId, name, position) {
    const data = await this._load(userId);
    const playlist = data.playlists[name];
    if (!playlist) {
      throw new Error(`Playlist "${name}" does not exist.`);
    }
    if (position < 1 || position > playlist.tracks.length) {
      throw new Error(`Invalid position ${position}. Playlist has ${playlist.tracks.length} tracks.`);
    }
    playlist.tracks.splice(position - 1, 1);
    await this._persist(userId, data);
    return playlist;
  }

  async setPlaylistCover(userId, name, coverUrl) {
    const data = await this._load(userId);
    const playlist = data.playlists[name];
    if (!playlist) {
      throw new Error(`Playlist "${name}" does not exist.`);
    }
    playlist.coverUrl = coverUrl;
    await this._persist(userId, data);
    return playlist;
  }

  async saveQueueToPlaylist(userId, name, tracks) {
    const data = await this._load(userId);
    const playlist = data.playlists[name];
    if (!playlist) {
      throw new Error(`Playlist "${name}" does not exist.`);
    }
    const available = PLAYLIST_MAX_TRACKS - playlist.tracks.length;
    if (tracks.length > available) {
      throw new Error(`Cannot add ${tracks.length} tracks. Only ${available} slots remaining.`);
    }
    const now = new Date().toISOString();
    for (const track of tracks) {
      playlist.tracks.push({
        encoded: track.encoded,
        title: track.info?.title ?? 'Unknown',
        uri: track.info?.uri ?? null,
        duration: track.info?.length ?? 0,
        addedAt: now,
      });
    }
    await this._persist(userId, data);
    return playlist;
  }
}
