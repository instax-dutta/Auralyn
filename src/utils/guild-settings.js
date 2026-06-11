import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_SOURCE_PRIORITY = ['direct', 'youtube'];
export const VALID_SOURCES = new Set(['direct', 'youtube', 'soundcloud']);

export const defaultGuildSettings = Object.freeze({
  defaultVolume: 80,
  autoplay: false,
  inactivityTimeoutMs: 120000,
  djRoleIds: [],
  sourcePriority: DEFAULT_SOURCE_PRIORITY,
  controlMode: 'public',
  twentyFourSeven: false,
  voteSkipEnabled: false,
  voteSkipThreshold: 50,
  announceTracks: false,
  announceChannelId: null,
  vcStatusEnabled: false,
  commandRestrictions: {},
  musicPanelChannelId: null,
  musicPanelMessageId: null,
  activeFilterName: null,
  defaultPlaylist: null,
  radioMode: false,
  radioConfig: null,
  lastfmScrobble: false,
  djModeEnabled: false,
});

function sanitizeNumber(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sanitizeGuildSettings(input = {}) {
  return {
    defaultVolume: sanitizeNumber(input.defaultVolume, defaultGuildSettings.defaultVolume, { min: 1, max: 100 }),
    autoplay: input.autoplay === true,
    inactivityTimeoutMs: sanitizeNumber(input.inactivityTimeoutMs, defaultGuildSettings.inactivityTimeoutMs, { min: 30000, max: 900000 }),
    djRoleIds: Array.isArray(input.djRoleIds)
      ? [...new Set(input.djRoleIds.filter((value) => typeof value === 'string' && value.trim() !== ''))]
      : [],
    sourcePriority: Array.isArray(input.sourcePriority) && input.sourcePriority.length > 0
      ? input.sourcePriority.filter(s => VALID_SOURCES.has(s))
      : defaultGuildSettings.sourcePriority,
    controlMode: input.controlMode === 'requester_or_dj' ? 'requester_or_dj' : 'public',
    twentyFourSeven: input.twentyFourSeven === true,
    voteSkipEnabled: input.voteSkipEnabled === true,
    voteSkipThreshold: sanitizeNumber(input.voteSkipThreshold, defaultGuildSettings.voteSkipThreshold, { min: 1, max: 100 }),
    announceTracks: input.announceTracks === true,
    announceChannelId: typeof input.announceChannelId === 'string' ? input.announceChannelId : null,
    vcStatusEnabled: input.vcStatusEnabled === true,
    commandRestrictions: (input.commandRestrictions && typeof input.commandRestrictions === 'object' && !Array.isArray(input.commandRestrictions))
      ? Object.fromEntries(
          Object.entries(input.commandRestrictions).map(([cmd, rule]) => [
            cmd,
            {
              ...(typeof rule?.channelId === 'string' ? { channelId: rule.channelId } : {}),
              ...(typeof rule?.djOnly === 'boolean' ? { djOnly: rule.djOnly } : {}),
            },
          ]),
        )
      : {},
    musicPanelChannelId: typeof input.musicPanelChannelId === 'string' ? input.musicPanelChannelId : null,
    musicPanelMessageId: typeof input.musicPanelMessageId === 'string' ? input.musicPanelMessageId : null,
    activeFilterName: typeof input.activeFilterName === 'string' ? input.activeFilterName : null,
    defaultPlaylist: typeof input.defaultPlaylist === 'string' ? input.defaultPlaylist : null,
    radioMode: input.radioMode === true,
    radioConfig: (input.radioConfig && typeof input.radioConfig === 'object') ? input.radioConfig : null,
    lastfmScrobble: input.lastfmScrobble === true,
    djModeEnabled: input.djModeEnabled === true,
  };
}

const DEFAULT_FILE_PATH = '/app/data/guild-settings.json';

export class GuildSettingsStore {
  constructor({ filePath } = {}) {
    this.filePath = filePath || DEFAULT_FILE_PATH;
    this.cache = null;
    this._loadSync();
  }

  _loadSync() {
    if (!existsSync(this.filePath)) {
      this.cache = {};
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = Object.fromEntries(
        Object.entries(parsed).map(([guildId, settings]) => [guildId, sanitizeGuildSettings(settings)]),
      );
    } catch (error) {
      this.cache = {};
    }
  }

  async ensureLoaded() {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = Object.fromEntries(
        Object.entries(parsed).map(([guildId, settings]) => [guildId, sanitizeGuildSettings(settings)]),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.cache = {};
    }

    return this.cache;
  }

  async persist() {
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.warn(`[guild-settings] Failed to persist: ${error.message}`);
    }
  }

  async get(guildId) {
    const cache = await this.ensureLoaded();
    return {
      ...defaultGuildSettings,
      ...(cache[guildId] ?? {}),
    };
  }

  async update(guildId, partialSettings) {
    const cache = await this.ensureLoaded();
    const nextSettings = sanitizeGuildSettings({
      ...(cache[guildId] ?? defaultGuildSettings),
      ...partialSettings,
    });
    cache[guildId] = nextSettings;
    await this.persist();
    return nextSettings;
  }

  async getAll() {
    const cache = await this.ensureLoaded();
    return Object.fromEntries(
      Object.entries(cache).map(([guildId, settings]) => [guildId, { ...defaultGuildSettings, ...settings }]),
    );
  }
}
