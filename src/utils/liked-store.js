import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dataPath } from './data-dir.js';

export class LikedStore {
  constructor() {
    this.cache = new Map();
  }

  getUserFilePath(userId) {
    return dataPath('liked', `${userId}.json`);
  }

  _loadSync(userId) {
    const filePath = this.getUserFilePath(userId);
    if (!existsSync(filePath)) {
      return { songs: [] };
    }
    try {
      const raw = readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { songs: [] };
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
      const empty = { songs: [] };
      this.cache.set(userId, empty);
      return empty;
    }
  }

  async _persist(userId, data) {
    const filePath = this.getUserFilePath(userId);
    await mkdir(dataPath('liked'), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2));
    this.cache.set(userId, data);
  }

  async getLikedSongs(userId) {
    const data = await this._load(userId);
    return data.songs;
  }

  async likeTrack(userId, track) {
    const data = await this._load(userId);
    const uri = track.info?.uri;
    if (!uri) return false;

    const exists = data.songs.some((s) => s.uri === uri);
    if (exists) return false;

    data.songs.unshift({
      encoded: track.encoded,
      title: track.info?.title ?? 'Unknown',
      uri,
      duration: track.info?.length ?? 0,
      addedAt: new Date().toISOString(),
    });

    await this._persist(userId, data);
    return true;
  }

  async unlikeTrack(userId, uri) {
    const data = await this._load(userId);
    const before = data.songs.length;
    data.songs = data.songs.filter((s) => s.uri !== uri);
    if (data.songs.length === before) return false;

    await this._persist(userId, data);
    return true;
  }

  async clearLikedSongs(userId) {
    const data = await this._load(userId);
    const count = data.songs.length;
    data.songs = [];
    await this._persist(userId, data);
    return count;
  }

  async sortLikedSongs(userId, key) {
    const data = await this._load(userId);
    if (key === 'title') {
      data.songs.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    } else if (key === 'duration') {
      data.songs.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
    } else if (key === 'date_added') {
      data.songs.sort((a, b) => new Date(b.addedAt ?? 0) - new Date(a.addedAt ?? 0));
    } else {
      throw new Error(`Unknown sort key: ${key}`);
    }
    await this._persist(userId, data);
    return data.songs;
  }
}
