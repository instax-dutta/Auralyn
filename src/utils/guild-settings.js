import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { dataPath } from './data-dir.js';
import { writeJsonAtomic, readJsonWithQuarantine } from './atomic-json.js';
import { withFileLock } from './storage-lock.js';

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

export function sanitizeGuildSettings(input = {}) {
  return {
    defaultVolume: sanitizeNumber(input.defaultVolume, defaultGuildSettings.defaultVolume, { min: 1, max: 100 }),
    autoplay: input.autoplay === true,
    inactivityTimeoutMs: sanitizeNumber(input.inactivityTimeoutMs, defaultGuildSettings.inactivityTimeoutMs, { min: 30000, max: 900000 }),
    djRoleIds: Array.isArray(input.djRoleIds)
      ? [...new Set(input.djRoleIds.filter(value => typeof value === 'string' && value.trim() !== ''))]
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

const LEGACY_FILE_NAME = 'guild-settings.json';

export function guildSettingsPath(guildId, { dataRoot } = {}) {
  const root = dataRoot ?? dataPath();
  return path.join(root, 'guilds', String(guildId), 'settings.json');
}

/**
 * Per-guild settings store.
 *
 * Production layout is one file per guild under `guilds/<id>/settings.json`, so
 * a corrupt or contended file can only affect its own guild. Passing
 * `filePath` selects the legacy single-file map layout, which is kept for tests
 * and for reading pre-migration data.
 */
export class GuildSettingsStore {
  constructor({ dataRoot, filePath, logger } = {}) {
    this.dataRoot = dataRoot ?? null;
    this.filePath = filePath ?? null;
    this.logger = logger ?? null;
    this.cache = null;
  }

  get legacyMode() {
    return this.filePath !== null;
  }

  pathFor(guildId) {
    return this.legacyMode ? this.filePath : guildSettingsPath(guildId, { dataRoot: this.dataRoot });
  }

  async readGuild(guildId) {
    const file = this.pathFor(guildId);
    const { value, quarantinedTo } = await readJsonWithQuarantine(file);

    if (quarantinedTo) {
      this.logger?.warn?.('guild_settings_quarantined', { file, quarantinedTo });
    }

    if (!value || typeof value !== 'object') return null;
    // Legacy single-file layout stores a map of guilds in one file.
    if (this.legacyMode && !('defaultVolume' in value) && guildId in value) {
      return value[guildId];
    }
    return value;
  }

  async writeGuild(guildId, settings) {
    const file = this.pathFor(guildId);
    // The lock file lives beside the target, so the directory must exist first.
    await mkdir(path.dirname(file), { recursive: true });
    await withFileLock(file, async () => {
      await writeJsonAtomic(file, settings);
    });
  }

  async get(guildId) {
    const stored = await this.readGuild(guildId);
    return { ...defaultGuildSettings, ...(stored ?? {}) };
  }

  async update(guildId, partialSettings) {
    const current = await this.get(guildId);
    const nextSettings = sanitizeGuildSettings({ ...current, ...partialSettings });

    if (this.legacyMode) {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await withFileLock(this.filePath, async () => {
        const { value } = await readJsonWithQuarantine(this.filePath);
        const cache = value && typeof value === 'object' ? value : {};
        cache[guildId] = nextSettings;
        this.cache = cache;
        await writeJsonAtomic(this.filePath, cache);
      });
    } else {
      await this.writeGuild(guildId, nextSettings);
    }

    return nextSettings;
  }

  async getAll() {
    if (this.legacyMode) {
      const { value } = await readJsonWithQuarantine(this.filePath);
      const cache = value && typeof value === 'object' ? value : {};
      return Object.fromEntries(
        Object.entries(cache).map(([guildId, settings]) => [guildId, { ...defaultGuildSettings, ...settings }]),
      );
    }

    const root = this.dataRoot ?? dataPath();
    let entries;
    try {
      entries = await readdir(path.join(root, 'guilds'));
    } catch {
      return {};
    }

    const result = {};
    for (const guildId of entries) {
      result[guildId] = await this.get(guildId);
    }
    return result;
  }
}