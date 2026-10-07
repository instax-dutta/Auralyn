import { LoadType } from 'shoukaku';
import { createSilentLogger } from '../utils/logger.js';
import { TimerRegistry } from '../utils/timer-registry.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { QueueManager, LOOP_TRACK } from './queue.js';
import { FILTER_PRESETS, DEFAULT_FILTER, PRESET_LAYER } from '../utils/audio-filters.js';
import { buildNowPlayingPayload, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

const END_REASONS_THAT_SHOULD_ADVANCE = new Set(['finished', 'loadFailed']);

// Discord voice WS close codes that are recoverable — shoukaku will rebuild the
// transport and Lavalink keeps the player state alive across the gap. We must NOT
// tear down the queue/session on these or 24/7 + queue-loop will break mid-playlist.
// 4014: disconnected by Discord (channel deleted / kicked / region moved)
// 4015: voice server crashed (Discord auto-reconnects)
// 4006: session no longer valid (auto-renegotiates)
// 1000/1001: normal/going-away — usually our own move
// 1006: abnormal closure — pure network blip
const RECOVERABLE_VOICE_CLOSE_CODES = new Set([1000, 1001, 1006, 4006, 4014, 4015]);

function isFilterPayloadMeaningful(filters) {
  if (!filters) return false;
  for (const value of Object.values(filters)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return true;
  }
  return false;
}

function resolveChannel(client, channelId) {
  if (!client || !channelId) return null;
  return client.channels?.cache?.get(channelId) ?? null;
}

export class MusicPlayer {
  constructor(shoukaku, logger = createSilentLogger(), {
    settingsStore = null,
    sessionStore = null,
    trackResolver = null,
    telemetry = null,
  } = {}) {
    this.shoukaku = shoukaku;
    this.logger = logger;
    this.settingsStore = settingsStore;
    this.sessionStore = sessionStore;
    this.trackResolver = trackResolver;
    this.telemetry = telemetry;
    this.queueManager = new QueueManager(logger.child('queue'));
    this.nowPlayingMessages = new Map();
    this.persistStamps = new Map();
    this.restorableGuilds = new Set();
    // Every timer this player starts is registered so shutdown can release the
    // ones no guild ever cleared.
    this.timers = new TimerRegistry();
  }

  startNowPlayingRefresh(guildId, message) {
    if (!message?.edit) return;
    this.stopNowPlayingRefresh(guildId);
    let consecutiveFails = 0;
    const BASE_INTERVAL = 60_000;
    const MAX_INTERVAL = 240_000;
    let currentInterval = BASE_INTERVAL;
    let lastPayloadKey = null;
    const tick = async () => {
      const state = this.queueManager.getState(guildId);
      if (!state?.isPlaying || !state?.currentTrack) {
        this.stopNowPlayingRefresh(guildId);
        return;
      }
      // Skip the edit when paused — position is frozen, nothing to refresh.
      if (state.isPaused) {
        const entry = this.nowPlayingMessages.get(guildId);
        if (entry) {
          this.timers.clear(entry.timer);
          entry.timer = this.timers.setTimeout(tick, currentInterval);
        }
        return;
      }
      const payload = buildNowPlayingPayload({
        track: state.currentTrack,
        position: state.lavalinkPlayer?.position ?? 0,
        volume: state.volume,
        loopMode: state.loopMode,
        queueLength: state.queue.length,
        autoplay: state.autoplay,
        guildId,
        isPaused: state.isPaused,
      });
      // Dedup: only edit when something meaningful changed (volume/loop/queueLen/autoplay/paused/trackId).
      const trackId = state.currentTrack?.info?.identifier ?? state.currentTrack?.encoded ?? '';
      const payloadKey = `${trackId}|${state.volume}|${state.loopMode}|${state.queue.length}|${state.autoplay ? 1 : 0}|${state.isPaused ? 1 : 0}`;
      if (payloadKey === lastPayloadKey) {
        const entry = this.nowPlayingMessages.get(guildId);
        if (entry) {
          this.timers.clear(entry.timer);
          entry.timer = this.timers.setTimeout(tick, currentInterval);
        }
        return;
      }
      try {
        await message.edit(payload);
        lastPayloadKey = payloadKey;
        consecutiveFails = 0;
        if (currentInterval !== BASE_INTERVAL) {
          currentInterval = BASE_INTERVAL;
          this.logger.debug(`nowPlayingRefresh reset to ${BASE_INTERVAL}ms for guild ${guildId}`);
        }
      } catch {
        consecutiveFails += 1;
        if (consecutiveFails >= 2) {
          this.logger.warn(`nowPlayingRefresh gave up after ${consecutiveFails} failures for guild ${guildId}`);
          this.stopNowPlayingRefresh(guildId);
          return;
        }
        currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
        this.logger.debug(`nowPlayingRefresh backed off to ${currentInterval}ms for guild ${guildId}`);
      }
      const entry = this.nowPlayingMessages.get(guildId);
      if (entry) {
        this.timers.clear(entry.timer);
        entry.timer = this.timers.setTimeout(tick, currentInterval);
      }
    };
    this.nowPlayingMessages.set(guildId, { message, timer: this.timers.setTimeout(tick, currentInterval) });
  }

  stopNowPlayingRefresh(guildId) {
    const entry = this.nowPlayingMessages.get(guildId);
    if (entry) {
      this.timers.clear(entry.timer);
      this.nowPlayingMessages.delete(guildId);
    }
  }

  get players() {
    return this.queueManager.players;
  }

  getPlayerState(guildId) {
    return this.queueManager.getSnapshot(guildId);
  }

  async enqueue({ guildId, track, textChannel, voiceChannel }) {
    const state = this.queueManager.getState(guildId);
    state.textChannel = textChannel;
    state.voiceChannel = voiceChannel;

    const nextTrack = {
      ...track,
      requestedByUserId: track.requestedByUserId ?? null,
      requestedByName: track.requestedByName ?? null,
    };

    this.queueManager.enqueue(guildId, nextTrack);

    if (!state.isPlaying) {
      this.logger.debug(`Guild ${guildId} is idle, starting playback`);
      await this.playNext(guildId, { skipNotification: true });
    }

    // Apply default volume + persist after playNext so the Lavalink player exists.
    this.getGuildSettings(guildId).then(settings => {
      if (state.volume !== settings.defaultVolume) {
        this.setVolume(guildId, settings.defaultVolume).catch(() => {});
      }
      void this.persistGuildState(guildId);
    }).catch(() => {});

    return state;
  }

  async play(guildId, track, textChannel, voiceChannel) {
    return this.enqueue({ guildId, track, textChannel, voiceChannel });
  }

  async enqueuePlaylist({ guildId, tracks, textChannel, voiceChannel }) {
    const state = this.queueManager.getState(guildId);
    state.textChannel = textChannel;
    state.voiceChannel = voiceChannel;

    this.queueManager.enqueueBulk(guildId, tracks);

    if (!state.isPlaying) {
      await this.playNext(guildId, { skipNotification: true });
    }

    this.getGuildSettings(guildId).then(settings => {
      if (state.volume !== settings.defaultVolume) {
        this.setVolume(guildId, settings.defaultVolume).catch(() => {});
      }
      void this.persistGuildState(guildId);
    }).catch(() => {});

    return state;
  }

  async getOrCreateLavalinkPlayer(guildId) {
    let player = this.queueManager.getLavalinkPlayer(guildId);
    if (player) return player;

    const voiceChannel = this.queueManager.getVoiceChannel(guildId);
    if (!voiceChannel) {
      throw new Error('Cannot create Lavalink player without a voice channel.');
    }

    this.logger.debug(`Joining voice channel ${voiceChannel.id} for guild ${guildId}`);
    player = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId: voiceChannel.id,
      shardId: voiceChannel.guild?.shardId ?? 0,
      deaf: true,
      mute: false,
    });
    this.logger.debug(`Joined voice channel ${voiceChannel.id} for guild ${guildId}`);

    const listeners = {
      end: (event) => this.handleTrackEnd(guildId, event),
      stuck: (event) => this.handleTrackProblem(guildId, event),
      exception: (event) => this.handleTrackProblem(guildId, event),
      closed: (event) => this.handleConnectionClosed(guildId, event),
    };

    for (const [event, listener] of Object.entries(listeners)) {
      player.on(event, listener);
    }

    const volume = this.queueManager.getVolume(guildId);
    await player.setGlobalVolume(volume);

    const filters = this.buildCombinedFilter(guildId);
    if (isFilterPayloadMeaningful(filters)) {
      await player.setFilters(filters);
    }

    this.queueManager.setLavalinkPlayer(guildId, player);
    this.queueManager.setListeners(guildId, listeners);
    return player;
  }

  async playNext(guildId, { skipNotification = false } = {}) {
    // Capture the existing now-playing message before stopping the refresh tick,
    // so we can edit it in-place instead of sending a new message on each track.
    // This is the main spam vector during loop / 24/7 stress tests.
    const existingNowPlaying = this.nowPlayingMessages.get(guildId)?.message ?? null;
    this.stopNowPlayingRefresh(guildId);
    const state = this.queueManager.getState(guildId);
    const nextTrack = this.queueManager.getNextTrack(state);

    if (!nextTrack) {
      // Try defaultPlaylist first (for 24/7 mode or when queue empties)
      const settings = await this.getGuildSettings(guildId);
      if (settings.defaultPlaylist) {
        // Load from the guild owner or first admin who set it — for now, fail gracefully
        // TODO: track playlist owner in settings or use a guild-level playlist store
        this.logger.debug(`Default playlist set (${settings.defaultPlaylist}) but owner unknown — skipping.`);
      }

      if (state.autoplay) {
        const autoTrack = await this.fetchAutoplayTrack(guildId);
        if (autoTrack) {
          this.queueManager.enqueue(guildId, autoTrack);
          // Autoplay announce removed; the next Now Playing message already
          // shows the 🔄 Autoplay flag, so a separate message was redundant.
          return this.playNext(guildId, { skipNotification: true });
        }
      }

      this.logger.debug(`No next track for guild ${guildId} — queue ended`);
      const textChannel = state.textChannel;
      this.queueManager.setCurrentTrack(guildId, null);
      state.isPlaying = false;
      state.isPaused = false;
      if (textChannel) {
        textChannel.send(buildSimpleV2(
          'Auralyn | Queue Ended',
          'The queue has ended. Add more tracks with `/play` or `/search`.',
          AuralynColors.info,
        )).catch(() => {});
      }
      return null;
    }

    this.queueManager.setCurrentTrack(guildId, nextTrack);

    this.logger.info(`Playing: ${nextTrack?.info?.title ?? 'unknown'}`);
    const player = await this.getOrCreateLavalinkPlayer(guildId);
    this.logger.debug(`Sending playTrack to Lavalink for guild ${guildId}`);
    await player.playTrack({ track: { encoded: nextTrack.encoded } });
    this.logger.debug(`playTrack completed for guild ${guildId}`);
    this.telemetry?.trackTrackPlayed();

    if (!skipNotification && state.textChannel) {
      const payload = buildNowPlayingPayload({
        track: nextTrack,
        position: 0,
        volume: state.volume,
        loopMode: state.loopMode,
        queueLength: state.queue.length,
        autoplay: state.autoplay,
        guildId,
        isPaused: false,
      });

      // Try to edit the previous now-playing message in place. Falls back to a
      // new send if no live message exists or the edit fails (deleted, etc.).
      const sendFresh = () => {
        state.textChannel.send(payload)
          .then(msg => this.startNowPlayingRefresh(guildId, msg))
          .catch(() => {});
      };
      if (existingNowPlaying?.edit) {
        existingNowPlaying.edit(payload)
          .then(() => this.startNowPlayingRefresh(guildId, existingNowPlaying))
          .catch(sendFresh);
      } else {
        sendFresh();
      }
    }

    void this.persistGuildState(guildId);

    this.getGuildSettings(guildId).then((settings) => {
      if (settings.announceTracks && settings.announceChannelId && settings.announceChannelId !== state.textChannel?.id) {
        const channel = state.textChannel?.guild?.channels?.cache?.get(settings.announceChannelId);
        if (channel?.send) {
          channel.send(buildNowPlayingPayload({
            track: nextTrack,
            position: 0,
            volume: state.volume,
            loopMode: state.loopMode,
            queueLength: state.queue.length,
            autoplay: state.autoplay,
            guildId,
            isPaused: false,
            headerText: 'Auralyn | Now Playing',
          })).catch(() => {});
        }
      }

      if (settings.vcStatusEnabled) {
        const voiceChannelId = state.voiceChannel?.id;
        const restClient = state.voiceChannel?.client?.rest;
        if (voiceChannelId && restClient) {
          const title = nextTrack?.info?.title ?? 'Music';
          restClient.put(`/channels/${voiceChannelId}/voice-status`, { body: { status: title } }).catch(() => {});
        }
      }
    }).catch(() => {});

    return nextTrack;
  }

  async handleTrackEnd(guildId, event = {}) {
    const state = this.queueManager.getState(guildId);
    if (!state.isPlaying) return;
    if (!END_REASONS_THAT_SHOULD_ADVANCE.has(event.reason ?? 'finished')) return;

    this.queueManager.onTrackEnd(guildId);
    await this.playNext(guildId);
  }

  async handleTrackProblem(guildId, event) {
    this.logger.error(`Track problem in guild ${guildId}`, event);
    await this.skip(guildId);
  }

  async handleConnectionClosed(guildId, event) {
    const code = event?.code;
    // Voice WS closes happen routinely during long sessions (region migration,
    // server reroute, transient packet loss). Shoukaku handles reconnection and
    // Lavalink preserves the player state. Previously this handler unconditionally
    // called stop(), which wiped the queue mid-playlist regardless of LOOP_QUEUE
    // or 24/7 mode. We now only log; legitimate channel-empty teardown is handled
    // by voiceStateUpdate.js and explicit /stop/disconnect.
    if (RECOVERABLE_VOICE_CLOSE_CODES.has(code) || code === undefined) {
      this.logger.warn(`Voice connection closed in guild ${guildId} (code=${code ?? 'unknown'}) — letting shoukaku reconnect`);
      return;
    }
    // Truly fatal code (e.g. 4004 authentication failed, 4011 server not found,
    // 4016 unknown encryption mode). The voice session can't be recovered.
    this.logger.error(`Voice connection closed with fatal code ${code} in guild ${guildId} — tearing down session`, event);
    await this.stop(guildId);
  }

  async skip(guildId) {
    const state = this.queueManager.getState(guildId);
    if (!state.currentTrack && state.queue.length === 0) return null;

    const player = state.lavalinkPlayer;
    this.queueManager.pushToHistory(guildId, state.currentTrack);
    state.currentTrack = null;

    if (player) {
      await player.stopTrack();
    }

    void this.persistGuildState(guildId);
    return this.playNext(guildId);
  }

  async join(guildId, voiceChannel, textChannel = null) {
    const state = this.queueManager.getState(guildId);
    state.voiceChannel = voiceChannel;
    if (textChannel) state.textChannel = textChannel;
    await this.getOrCreateLavalinkPlayer(guildId);
  }

  async leaveVoiceOnly(guildId) {
    this.stopNowPlayingRefresh(guildId);
    this.clearSleepTimer(guildId);
    this.cleanupGuild(guildId);
    const state = this.queueManager.getState(guildId);
    state.isPlaying = false;
    state.isPaused = false;
    state.currentTrack = null;
    // queue preserved intentionally — user passed keep_queue:true
    // Flag tells voiceStateUpdate to skip the players.delete() wipe
    state.preserveQueueOnLeave = true;
    await this.shoukaku.leaveVoiceChannel(guildId);
  }

  async enqueueFront({ guildId, track, textChannel, voiceChannel }) {
    const state = this.queueManager.getState(guildId);
    state.textChannel = textChannel;
    state.voiceChannel = voiceChannel;

    const nextTrack = {
      ...track,
      requestedByUserId: track.requestedByUserId ?? null,
      requestedByName: track.requestedByName ?? null,
    };

    this.queueManager.enqueueFront(guildId, nextTrack);

    if (!state.isPlaying) {
      this.logger.debug(`Guild ${guildId} is idle, starting playback for the front-inserted track`);
      await this.playNext(guildId, { skipNotification: true });
    }

    void this.persistGuildState(guildId);

    return state;
  }

  /**
   * Tears playback down and rebuilds it from a snapshot while preserving
   * order: the snapshot's queue stays in its original sequence and the
   * snapshot's current track becomes the current track again. Unlike
   * replaying enqueueFront, this never reverses the queue.
   */
  async restoreSession({ guildId, currentTrack = null, queue = [], textChannel = null, voiceChannel = null }) {
    const state = this.queueManager.getState(guildId);
    const restoreTextChannel = textChannel ?? state.textChannel;
    const restoreVoiceChannel = voiceChannel ?? state.voiceChannel;

    await this.stop(guildId);

    const fresh = this.queueManager.getState(guildId);
    fresh.textChannel = restoreTextChannel;
    fresh.voiceChannel = restoreVoiceChannel;
    fresh.queue = [...queue];

    if (currentTrack) {
      fresh.queue.unshift(currentTrack);
    }

    if (fresh.queue.length === 0) {
      return { restored: 0, resumed: false };
    }

    await this.playNext(guildId, { skipNotification: true });

    return {
      restored: fresh.queue.length,
      resumed: fresh.isPlaying,
    };
  }

  clearSleepTimer(guildId) {
    const state = this.queueManager.getState(guildId);
    if (state.sleepTimer) {
      this.timers.clear(state.sleepTimer);
      state.sleepTimer = null;
    }
  }

  setSleepTimer(guildId, ms) {
    this.clearSleepTimer(guildId);
    const state = this.queueManager.getState(guildId);
    state.sleepTimer = this.timers.setTimeout(() => {
      this.stop(guildId).catch(() => {});
    }, ms);
  }

  async clearVoiceStatus(guildId, state) {
    try {
      const settings = await this.getGuildSettings(guildId);
      if (!settings.vcStatusEnabled) return;
      const voiceChannelId = state?.voiceChannel?.id;
      const restClient = state?.voiceChannel?.client?.rest;
      if (voiceChannelId && restClient) {
        await restClient.put(`/channels/${voiceChannelId}/voice-status`, { body: { status: '' } });
      }
    } catch { /* ignore — 403 on free tier or no permission */ }
  }

  /**
   * Recoverable disconnect: leaves the voice channel but keeps the queue and
   * persists it, so a restart can restore it. This is what an empty voice
   * channel and `/disconnect` use. It never records a tombstone.
   */
  async disconnect(guildId) {
    this.stopNowPlayingRefresh(guildId);
    this.clearSleepTimer(guildId);

    const state = this.queueManager.getState(guildId);
    await this.clearVoiceStatus(guildId, state);

    // Capture the snapshot before tearing down transport, so the queue survives.
    await this.persistGuildState(guildId);

    this.cleanupGuild(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.queueManager.cleanup(guildId);
  }

  /**
   * Destructive stop: clears the queue and records a tombstone so a restart does
   * not restore it. This is what `/stop` uses.
   *
   * It must not route through `disconnect()`, which is recoverable and would
   * re-persist the very session being cleared.
   */
  async stop(guildId) {
    this.stopNowPlayingRefresh(guildId);
    this.clearSleepTimer(guildId);

    const state = this.queueManager.getState(guildId);
    state.queue = [];
    state.currentTrack = null;
    state.isPlaying = false;
    state.isPaused = false;

    if (state.lavalinkPlayer) {
      try {
        await state.lavalinkPlayer.stopTrack();
      } catch (error) {
        this.logger.error(`Failed to stop Lavalink player in guild ${guildId}`, error);
      }
    }

    await this.clearVoiceStatus(guildId, state);

    this.cleanupGuild(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.queueManager.cleanup(guildId);

    if (this.sessionStore?.delete) {
      await this.sessionStore.delete(guildId);
    }
  }

  /**
   * Recoverable shutdown: quiesces admission, flushes every live guild, and
   * leaves the voice channel. Sessions stay restorable, so a redeploy resumes
   * where it left off instead of starting empty.
   */
  async shutdown() {
    this.shuttingDown = true;

    const guildIds = [...this.queueManager.players.keys()];

    await Promise.all(guildIds.map(guildId => this.disconnect(guildId).catch(error => {
      this.logger.error(`Failed to disconnect guild ${guildId} during shutdown`, error);
    })));

    this.nowPlayingMessages.clear();
    const released = this.timers.dispose();

    return { guilds: guildIds.length, timersReleased: released };
  }

  cleanupGuild(guildId) {
    const player = this.queueManager.getLavalinkPlayer(guildId);
    const listeners = this.queueManager.getListeners(guildId);
    if (!listeners || !player) return;

    for (const [event, listener] of Object.entries(listeners)) {
      player.off(event, listener);
    }

    this.queueManager.setListeners(guildId, null);
    this.queueManager.setLavalinkPlayer(guildId, null);
  }

  async pause(guildId) {
    const state = this.queueManager.getState(guildId);
    if (!state.isPlaying || state.isPaused || !state.lavalinkPlayer) return false;

    await state.lavalinkPlayer.setPaused(true);
    state.isPaused = true;
    await this.persistGuildState(guildId);
    return true;
  }

  async resume(guildId) {
    const state = this.queueManager.getState(guildId);
    if (!state.isPlaying || !state.isPaused || !state.lavalinkPlayer) return false;

    await state.lavalinkPlayer.setPaused(false);
    state.isPaused = false;
    await this.persistGuildState(guildId);
    return true;
  }

  async setVolume(guildId, volume) {
    const safeVolume = Math.max(1, Math.min(100, Number(volume)));
    this.queueManager.setVolume(guildId, safeVolume);

    const player = this.queueManager.getLavalinkPlayer(guildId);
    if (player) {
      await player.setGlobalVolume(safeVolume);
    }

    await this.persistGuildState(guildId);
    return safeVolume;
  }

  async seek(guildId, positionMs) {
    const state = this.queueManager.getState(guildId);
    if (!state.isPlaying || !state.lavalinkPlayer) throw new Error('Nothing is playing.');

    const track = state.currentTrack;
    if (track?.info?.isStream) throw new Error('Cannot seek in a live stream.');

    const duration = track?.info?.length ?? 0;
    if (positionMs < 0 || positionMs > duration) {
      throw new Error(`Seek position out of range. Track length is ${Math.floor(duration / 1000)}s.`);
    }

    await state.lavalinkPlayer.seekTo(positionMs);
    return positionMs;
  }

  buildCombinedFilter(guildId) {
    const state = this.queueManager.getState(guildId);
    const layers = state.filterLayers ?? { eq: DEFAULT_FILTER, timescale: null, rotation: null, karaoke: null, vibrato: null };

    const combined = {
      equalizer: [],
      karaoke: null,
      timescale: null,
      tremolo: null,
      vibrato: null,
      rotation: null,
      distortion: null,
      channelMix: null,
      lowPass: null,
    };

    // EQ layer
    const eqPreset = layers.eq ? FILTER_PRESETS[layers.eq] : null;
    if (eqPreset) {
      combined.equalizer = eqPreset.equalizer ?? [];
      if (eqPreset.lowPass) combined.lowPass = eqPreset.lowPass;
    }

    // Timescale layer (lofi adds lowPass, vaporwave adds EQ if no explicit EQ active)
    if (layers.timescale) {
      const tp = FILTER_PRESETS[layers.timescale];
      combined.timescale = tp.timescale ?? null;
      combined.distortion = tp.distortion ?? null;
      if (tp.lowPass) combined.lowPass = tp.lowPass;
      // vaporwave has subtle EQ — apply only when no explicit EQ preset is active
      // vaporwave has subtle EQ — apply only when no explicit non-default EQ is active
      if (tp.equalizer?.length > 0 && (!layers.eq || layers.eq === DEFAULT_FILTER)) {
        combined.equalizer = tp.equalizer;
      }
    }

    // Independent layers
    if (layers.rotation) combined.rotation = FILTER_PRESETS[layers.rotation]?.rotation ?? null;
    if (layers.karaoke) combined.karaoke = FILTER_PRESETS[layers.karaoke]?.karaoke ?? null;
    if (layers.vibrato) {
      const vp = FILTER_PRESETS[layers.vibrato];
      combined.vibrato = vp?.vibrato ?? null;
      combined.tremolo = vp?.tremolo ?? null;
    }

    return combined;
  }

  // Returns { ok: true, preset } on success, or { ok: false, reason } on conflict.
  async setFilter(guildId, preset) {
    if (!FILTER_PRESETS[preset]) throw new Error(`Unknown filter preset: ${preset}`);

    const state = this.queueManager.getState(guildId);
    const empty = { eq: DEFAULT_FILTER, timescale: null, rotation: null, karaoke: null, vibrato: null };

    // Stacking disabled: always reset to a clean slate, then apply only the
    // requested preset on its own layer. Prevents filter combos that degrade
    // the tuned audio quality.
    if (preset === 'flat') {
      state.filterLayers = { ...empty };
    } else {
      state.filterLayers = { ...empty };
      const layer = PRESET_LAYER[preset];
      if (layer) state.filterLayers[layer] = preset;
    }

    this.queueManager.setFilterPreset(guildId, preset);

    const player = this.queueManager.getLavalinkPlayer(guildId);
    if (player) {
      await player.setFilters(this.buildCombinedFilter(guildId));
    }

    this._refreshNowPlayingEmbed(guildId);

    return { ok: true, preset };
  }

  _refreshNowPlayingEmbed(guildId) {
    const entry = this.nowPlayingMessages.get(guildId);
    if (!entry?.message?.edit) return;
    const state = this.queueManager.getState(guildId);
    if (!state?.isPlaying || !state?.currentTrack) return;
    entry.message.edit(
      buildNowPlayingPayload({
        track: state.currentTrack,
        position: state.lavalinkPlayer?.position ?? 0,
        volume: state.volume,
        loopMode: state.loopMode,
        queueLength: state.queue.length,
        autoplay: state.autoplay,
        guildId,
        isPaused: state.isPaused,
      }),
    ).catch(() => {});
  }

  shuffle(guildId) {
    const queue = this.queueManager.shuffle(guildId);
    void this.persistGuildState(guildId);
    return queue;
  }

  setLoopMode(guildId, mode) {
    const result = this.queueManager.setLoopMode(guildId, mode);
    void this.persistGuildState(guildId);
    return result;
  }

  remove(guildId, position) {
    const removed = this.queueManager.remove(guildId, position);
    void this.persistGuildState(guildId);
    return removed;
  }

  move(guildId, from, to) {
    const moved = this.queueManager.move(guildId, from, to);
    void this.persistGuildState(guildId);
    return moved;
  }

  clear(guildId) {
    this.queueManager.clearQueue(guildId);
    void this.persistGuildState(guildId);
  }

  async jump(guildId, position) {
    this.queueManager.jumpTo(guildId, position);
    await this.skip(guildId);
  }

  getPosition(guildId) {
    return this.queueManager.getLavalinkPlayer(guildId)?.position ?? 0;
  }

  getQueue(guildId) {
    return this.queueManager.getQueue(guildId);
  }

  getCurrentTrack(guildId) {
    return this.queueManager.getCurrentTrack(guildId);
  }

  getHistory(guildId) {
    return this.queueManager.getHistory(guildId);
  }

  toggleAutoplay(guildId) {
    const current = this.queueManager.getAutoplay(guildId);
    this.queueManager.setAutoplay(guildId, !current);
    return !current;
  }

  async previous(guildId) {
    const state = this.queueManager.getState(guildId);
    const history = this.queueManager.getHistory(guildId);
    if (history.length === 0) return null;

    const prevTrack = history.shift();
    if (state.currentTrack) {
      state.queue.unshift(state.currentTrack);
    }
    state.currentTrack = null;

    const player = state.lavalinkPlayer;
    if (player) {
      await player.stopTrack();
    }

    await this.persistGuildState(guildId);
    return this.playNext(guildId);
  }

  set247(guildId, enabled) {
    this.queueManager.setStayInVC(guildId, enabled);
    this.logger.info(`24/7 mode ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
  }

  async fetchAutoplayTrack(guildId) {
    const history = this.queueManager.getHistory(guildId);
    const seed = history[0];
    if (!seed?.info) return null;

    const node = this.shoukaku.getIdealNode();
    if (!node) return null;

    const extractYouTubeVideoId = (uri) => {
      if (!uri) return null;
      const m = uri.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
      return m?.[1] ?? null;
    };
    const normalizeTitle = (title) => (title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const seenVideoIds = new Set(history.map(t => extractYouTubeVideoId(t.info?.uri)).filter(Boolean));
    const seenTitles = new Set(history.map(t => normalizeTitle(t.info?.title)).filter(Boolean));

    const isNovel = (candidate) => {
      const vId = extractYouTubeVideoId(candidate.info?.uri);
      const nTitle = normalizeTitle(candidate.info?.title);
      if (vId && seenVideoIds.has(vId)) return false;
      if (nTitle && seenTitles.has(nTitle)) return false;
      return true;
    };

    const seedVideoId = extractYouTubeVideoId(seed.info?.uri);
    if (seedVideoId) {
      try {
        const mixUrl = `https://www.youtube.com/watch?v=${seedVideoId}&list=RD${seedVideoId}`;
        const result = await node.rest.resolve(mixUrl);
        const tracks = result?.data?.tracks ?? (Array.isArray(result?.data) ? result.data : []);
        if (tracks.length > 0) {
          const novel = tracks.find(isNovel);
          if (novel) return novel;
        }
      } catch (err) {
        this.logger.warn(`Autoplay: no Mix available for "${seed.info.title ?? 'track'}" — using artist fallback`);
      }
    }

    try {
      const fallbackQuery = `ytsearch:${seed.info.author || seed.info.title}`;
      const result = await node.rest.resolve(fallbackQuery);
      if (!result || result.loadType !== LoadType.SEARCH || !result.data?.length) return null;
      return result.data.find(isNovel) ?? null;
    } catch (err) {
      this.logger.warn(`Autoplay: fallback search failed for guild ${guildId} — ${err.message}`);
      return null;
    }
  }

  async getGuildSettings(guildId) {
    if (!this.settingsStore?.get) return defaultGuildSettings;
    return this.settingsStore.get(guildId);
  }

  /**
   * Captures a session snapshot.
   *
   * `updatedAt` is a monotonic per-guild stamp, not a wall clock read. Two
   * persists that race therefore still order correctly, and the store's
   * staleness guard can never reject this guild's own newer write.
   */
  /**
   * Hydrates persisted sessions into logical player state without touching
   * voice. This runs when the client is ready, before Lavalink is guaranteed to
   * be connected, so a guild that was playing before a restart is marked
   * restorable rather than connected.
   *
   * Guilds whose last outcome was a destructive stop are skipped, because a
   * tombstone is exactly the record that they should not come back.
   */
  async restoreSessions({ client } = {}) {
    if (!this.sessionStore?.getAll) return [];

    const all = await this.sessionStore.getAll();
    const restored = [];

    for (const [guildId, snapshot] of Object.entries(all)) {
      if (!snapshot) continue;

      if (await this.sessionStore.wasStopped?.(guildId)) {
        this.logger.debug(`Skipping restore for stopped guild ${guildId}`);
        continue;
      }

      const state = this.queueManager.getState(guildId);
      state.queue = Array.isArray(snapshot.queue) ? snapshot.queue : [];
      state.currentTrack = snapshot.currentTrack ?? null;
      state.isPlaying = false;
      state.isPaused = false;
      state.restored = true;

      if (typeof snapshot.volume === 'number') state.volume = snapshot.volume;
      if (typeof snapshot.loopMode === 'number') state.loopMode = snapshot.loopMode;

      // Channels are stored as ids, so resolve them against the live caches.
      // A channel that no longer exists must not cost us the restored queue.
      state.textChannel = resolveChannel(client, snapshot.textChannelId);
      state.voiceChannel = resolveChannel(client, snapshot.voiceChannelId);

      restored.push(guildId);
    }

    this.restorableGuilds = new Set(restored);

    if (restored.length > 0) {
      this.logger.info(`Restored ${restored.length} session(s) from disk`);
    }

    return restored;
  }

  /**
   * Reconnects every restorable guild that has something to play. Called once
   * Lavalink reports ready, since playback cannot resume before then.
   */
  async reattachRestored() {
    const attached = [];

    for (const guildId of this.restorableGuilds ?? []) {
      const state = this.queueManager.getState(guildId);
      if (!state.currentTrack || !state.voiceChannel) continue;

      try {
        await this.join(guildId, state.voiceChannel, state.textChannel);

        // Resume the track that was playing rather than advancing to the next
        // one: `playNext` shifts from the queue, which would skip the restored
        // current track entirely.
        const player = await this.getOrCreateLavalinkPlayer(guildId);
        await player.playTrack({ track: { encoded: state.currentTrack.encoded } });
        state.isPlaying = true;
        this.telemetry?.trackTrackPlayed();

        attached.push(guildId);
      } catch (error) {
        this.logger.error(`Failed to reattach guild ${guildId}`, error);
      }
    }

    if (attached.length > 0) {
      this.logger.info(`Reattached ${attached.length} restored session(s)`);
    }

    return attached;
  }

  async persistGuildState(guildId) {
    if (!this.sessionStore?.save) return;

    const state = this.queueManager.getState(guildId);
    const last = this.persistStamps.get(guildId) ?? 0;
    const now = Math.max(Date.now(), last + 1);
    this.persistStamps.set(guildId, now);

    try {
      await this.sessionStore.save(guildId, {
        guildId,
        queue: state.queue,
        currentTrack: state.currentTrack,
        volume: state.volume,
        loopMode: state.loopMode,
        textChannelId: state.textChannel?.id ?? null,
        voiceChannelId: state.voiceChannel?.id ?? null,
        updatedAt: new Date(now).toISOString(),
      });
    } catch (error) {
      // A stale rejection means another writer already holds a newer view; it
      // must not surface as an unhandled rejection from a fire-and-forget call.
      if (error?.name !== 'StaleRevisionError') throw error;
      this.logger.debug(`Skipped a stale session write for guild ${guildId}`);
    }
  }
}
