import { LoadType } from 'shoukaku';
import { createSilentLogger } from '../utils/logger.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { QueueManager, LOOP_TRACK } from './queue.js';
import { FILTER_PRESETS, DEFAULT_FILTER } from '../utils/audio-filters.js';
import { buildNowPlayingPayload, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

const END_REASONS_THAT_SHOULD_ADVANCE = new Set(['finished', 'loadFailed']);

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
  }

  startNowPlayingRefresh(guildId, message) {
    this.stopNowPlayingRefresh(guildId);
    const interval = setInterval(async () => {
      const state = this.queueManager.getState(guildId);
      if (!state?.isPlaying || !state?.currentTrack) {
        this.stopNowPlayingRefresh(guildId);
        return;
      }
      try {
        await message.edit(
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
        );
      } catch {
        this.stopNowPlayingRefresh(guildId);
      }
    }, 15_000);
    this.nowPlayingMessages.set(guildId, { message, interval });
  }

  stopNowPlayingRefresh(guildId) {
    const entry = this.nowPlayingMessages.get(guildId);
    if (entry) {
      clearInterval(entry.interval);
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

    const settings = await this.getGuildSettings(guildId);
    if (state.volume !== settings.defaultVolume) {
      await this.setVolume(guildId, settings.defaultVolume);
    }

    await this.persistGuildState(guildId);

    if (!state.isPlaying) {
      this.logger.debug(`Guild ${guildId} is idle, starting playback`);
      await this.playNext(guildId, { skipNotification: true });
    }

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

    const settings = await this.getGuildSettings(guildId);
    if (state.volume !== settings.defaultVolume) {
      await this.setVolume(guildId, settings.defaultVolume);
    }

    await this.persistGuildState(guildId);

    if (!state.isPlaying) {
      await this.playNext(guildId, { skipNotification: true });
    }

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

    const preset = this.queueManager.getFilterPreset(guildId) ?? DEFAULT_FILTER;
    const filters = FILTER_PRESETS[preset];
    if (filters && Object.keys(filters).length > 0) {
      await player.setFilters(filters);
    }

    this.queueManager.setLavalinkPlayer(guildId, player);
    this.queueManager.setListeners(guildId, listeners);
    return player;
  }

  async playNext(guildId, { skipNotification = false } = {}) {
    this.stopNowPlayingRefresh(guildId);
    const state = this.queueManager.getState(guildId);
    const nextTrack = this.queueManager.getNextTrack(state);

    if (!nextTrack) {
      if (state.autoplay) {
        const autoTrack = await this.fetchAutoplayTrack(guildId);
        if (autoTrack) {
          this.queueManager.enqueue(guildId, autoTrack);
          if (state.textChannel) {
            state.textChannel.send(buildSimpleV2(
              'Auralyn | Autoplay',
              `Autoplaying **[${autoTrack.info?.title ?? 'Unknown'}](${autoTrack.info?.uri ?? ''})** based on your recent listening.`,
              AuralynColors.info,
            )).catch(() => {});
          }
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
      state.textChannel.send(
        buildNowPlayingPayload({
          track: nextTrack,
          position: 0,
          volume: state.volume,
          loopMode: state.loopMode,
          queueLength: state.queue.length,
          autoplay: state.autoplay,
          guildId,
          isPaused: false,
        }),
      ).then(msg => this.startNowPlayingRefresh(guildId, msg)).catch(() => {});
    }

    await this.persistGuildState(guildId);
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
    this.logger.warn(`Voice connection closed in guild ${guildId}`, event);
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

    await this.persistGuildState(guildId);
    return this.playNext(guildId);
  }

  async stop(guildId) {
    this.stopNowPlayingRefresh(guildId);
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

    await this.disconnect(guildId);
  }

  async disconnect(guildId) {
    this.stopNowPlayingRefresh(guildId);
    this.cleanupGuild(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.queueManager.cleanup(guildId);
    if (this.sessionStore?.delete) {
      await this.sessionStore.delete(guildId);
    }
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

  async setFilter(guildId, preset) {
    if (!FILTER_PRESETS[preset]) throw new Error(`Unknown filter preset: ${preset}`);

    this.queueManager.setFilterPreset(guildId, preset);

    const player = this.queueManager.getLavalinkPlayer(guildId);
    if (player) {
      await player.setFilters(FILTER_PRESETS[preset]);
    }

    return preset;
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

  async persistGuildState(guildId) {
    if (!this.sessionStore?.save) return;

    const state = this.queueManager.getState(guildId);
    await this.sessionStore.save(guildId, {
      guildId,
      queue: state.queue,
      currentTrack: state.currentTrack,
      volume: state.volume,
      loopMode: state.loopMode,
      textChannelId: state.textChannel?.id ?? null,
      voiceChannelId: state.voiceChannel?.id ?? null,
      updatedAt: new Date().toISOString(),
    });
  }
}
