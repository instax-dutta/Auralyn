import { createSilentLogger } from '../utils/logger.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { QueueManager, LOOP_TRACK } from './queue.js';

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
    this.voteSkipSets = new Map();
    this._reconnecting = new Set();
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
      this.logger.info(`Guild ${guildId} is idle, starting playback`);
      await this.playNext(guildId);
    }

    return state;
  }

  async play(guildId, track, textChannel, voiceChannel) {
    return this.enqueue({ guildId, track, textChannel, voiceChannel });
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

    const settings = await this.getGuildSettings(guildId);
    if (state.volume !== settings.defaultVolume) {
      await this.setVolume(guildId, settings.defaultVolume);
    }

    await this.persistGuildState(guildId);

    if (!state.isPlaying) {
      this.logger.info(`Guild ${guildId} is idle, starting playback`);
      await this.playNext(guildId);
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

    this.logger.info(`Joining voice channel ${voiceChannel.id} for guild ${guildId}`);
    player = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId: voiceChannel.id,
      shardId: voiceChannel.guild?.shardId ?? 0,
      deaf: true,
      mute: false,
    });
    this.logger.info(`Joined voice channel ${voiceChannel.id} for guild ${guildId}`);

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
    this.queueManager.setLavalinkPlayer(guildId, player);
    this.queueManager.setListeners(guildId, listeners);
    return player;
  }

  async playNext(guildId) {
    const state = this.queueManager.getState(guildId);
    const nextTrack = this.queueManager.getNextTrack(state);

    if (!nextTrack) {
      this.logger.info(`No next track available for guild ${guildId}`);
      this.queueManager.setCurrentTrack(guildId, null);
      state.isPlaying = false;
      state.isPaused = false;
      this.clearVoteSkipSet(guildId);
      return null;
    }

    this.queueManager.setCurrentTrack(guildId, nextTrack);
    this.clearVoteSkipSet(guildId);

    this.logger.info(`Preparing to play track for guild ${guildId}: ${nextTrack?.info?.title ?? 'unknown'}`);
    const player = await this.getOrCreateLavalinkPlayer(guildId);
    this.logger.info(`Sending playTrack to Lavalink for guild ${guildId}`);
    await player.playTrack({ track: { encoded: nextTrack.encoded } });
    this.logger.info(`playTrack completed for guild ${guildId}`);
    this.telemetry?.trackTrackPlayed();
    await this.persistGuildState(guildId);
    return nextTrack;
  }

  async handleTrackEnd(guildId, event = {}) {
    const state = this.queueManager.getState(guildId);
    if (!state.isPlaying) return;
    if (!END_REASONS_THAT_SHOULD_ADVANCE.has(event.reason ?? 'finished')) return;

    this.queueManager.pushHistory(guildId);
    this.queueManager.onTrackEnd(guildId);

    const nextTrack = this.queueManager.getNextTrack(state);

    if (nextTrack) {
      this.queueManager.setCurrentTrack(guildId, nextTrack);
      this.clearVoteSkipSet(guildId);
      const player = await this.getOrCreateLavalinkPlayer(guildId);
      await player.playTrack({ track: { encoded: nextTrack.encoded } });
      this.telemetry?.trackTrackPlayed();
      await this.persistGuildState(guildId);
      return;
    }

    const autoplayTrack = await this.tryAutoplay(guildId);
    if (autoplayTrack) {
      this.queueManager.setCurrentTrack(guildId, autoplayTrack);
      this.clearVoteSkipSet(guildId);
      const player = await this.getOrCreateLavalinkPlayer(guildId);
      await player.playTrack({ track: { encoded: autoplayTrack.encoded } });
      this.telemetry?.trackTrackPlayed();
      await this.persistGuildState(guildId);
      return;
    }

    this.queueManager.setCurrentTrack(guildId, null);
    state.isPlaying = false;
    state.isPaused = false;
    this.clearVoteSkipSet(guildId);
  }

  async tryAutoplay(guildId) {
    const state = this.queueManager.getState(guildId);
    const settings = await this.getGuildSettings(guildId);
    if (!settings.autoplay) return null;

    const history = this.queueManager.getHistory(guildId);
    const seedTrack = history[history.length - 1];
    if (!seedTrack?.info?.title) return null;

    const source = settings.sourcePriority?.[0] ?? 'youtube';
    const artist = seedTrack.info.author ?? '';
    const title = seedTrack.info.title;

    const query = `${artist} ${title}`.trim();
    if (!query) return null;

    if (!this.trackResolver?.resolve) return null;

    try {
      const result = await this.trackResolver.resolve(this.shoukaku, query, { sourcePriority: [source] });
      if (!result?.track) return null;

      return {
        ...result.track,
        requestedByUserId: null,
        requestedByName: 'autoplay',
      };
    } catch (error) {
      this.logger.error(`Autoplay search failed for guild ${guildId}`, error);
      return null;
    }
  }

  async handleTrackProblem(guildId, event) {
    this.logger.error(`Track problem in guild ${guildId}`, event);
    await this.skip(guildId);
  }

  async handleConnectionClosed(guildId, event) {
    this.logger.warn(`Voice connection closed in guild ${guildId}`, event);

    if (this._reconnecting.has(guildId)) {
      this.logger.info(`Already reconnecting for guild ${guildId}, ignoring duplicate close event`);
      return;
    }

    const settings = await this.getGuildSettings(guildId);
    if (settings.twentyFourSeven) {
      this.logger.info(`24/7 mode enabled, reconnecting for guild ${guildId}`);

      this.cleanupGuild(guildId);
      const state = this.queueManager.getState(guildId);
      state.lavalinkPlayer = null;

      this._reconnecting.add(guildId);
      try {
        const voiceChannel = state.voiceChannel;
        if (!voiceChannel) {
          this.logger.warn(`No voice channel stored for guild ${guildId}, cannot reconnect`);
          await this.stop(guildId);
          return;
        }

        const player = await this.shoukaku.joinVoiceChannel({
          guildId,
          channelId: voiceChannel.id,
          shardId: voiceChannel.guild?.shardId ?? 0,
          deaf: true,
          mute: false,
        });

        const listeners = {
          end: (event) => this.handleTrackEnd(guildId, event),
          stuck: (event) => this.handleTrackProblem(guildId, event),
          exception: (event) => this.handleTrackProblem(guildId, event),
          closed: (event) => this.handleConnectionClosed(guildId, event),
        };

        for (const [event, listener] of Object.entries(listeners)) {
          player.on(event, listener);
        }

        state.lavalinkPlayer = player;
        this.queueManager.setListeners(guildId, listeners);

        if (state.currentTrack) {
          await player.playTrack({ track: { encoded: state.currentTrack.encoded } });
          this.logger.info(`Resumed playback for guild ${guildId}`);
        } else if (state.queue.length > 0) {
          await this.playNext(guildId);
        } else {
          this.logger.info(`Reconnected voice for guild ${guildId}, queue is empty`);
        }

        return;
      } catch (error) {
        this.logger.error(`Failed to reconnect for guild ${guildId}`, error);
        await this.stop(guildId);
        return;
      } finally {
        this._reconnecting.delete(guildId);
      }
    }

    await this.stop(guildId);
  }

  async skip(guildId) {
    const state = this.queueManager.getState(guildId);
    if (!state.currentTrack && state.queue.length === 0) return null;

    this.queueManager.pushHistory(guildId);

    const player = state.lavalinkPlayer;
    state.currentTrack = null;

    if (player) {
      await player.stopTrack();
    }

    this.clearVoteSkipSet(guildId);
    await this.persistGuildState(guildId);
    return this.playNext(guildId);
  }

  async stop(guildId) {
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

    this.clearVoteSkipSet(guildId);
    await this.disconnect(guildId);
  }

  async disconnect(guildId) {
    this.cleanupGuild(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.queueManager.cleanup(guildId);
    this.voteSkipSets.delete(guildId);
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

  getQueue(guildId) {
    return this.queueManager.getQueue(guildId);
  }

  getCurrentTrack(guildId) {
    return this.queueManager.getCurrentTrack(guildId);
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

  clearVoteSkipSet(guildId) {
    this.voteSkipSets.delete(guildId);
  }

  getVoteSkipSet(guildId) {
    if (!this.voteSkipSets.has(guildId)) {
      this.voteSkipSets.set(guildId, new Set());
    }
    return this.voteSkipSets.get(guildId);
  }

  async previous(guildId) {
    const state = this.queueManager.getState(guildId);
    const prevTrack = this.queueManager.popHistory(guildId);
    if (!prevTrack) return null;

    if (state.currentTrack) {
      state.queue.unshift(state.currentTrack);
    }

    if (state.lavalinkPlayer) {
      await state.lavalinkPlayer.stopTrack();
    }

    this.queueManager.setCurrentTrack(guildId, prevTrack);
    this.clearVoteSkipSet(guildId);

    const player = await this.getOrCreateLavalinkPlayer(guildId);
    await player.playTrack({ track: { encoded: prevTrack.encoded } });
    this.telemetry?.trackTrackPlayed();
    await this.persistGuildState(guildId);
    return prevTrack;
  }

  async setAutoplay(guildId, enabled) {
    if (this.settingsStore?.update) {
      return this.settingsStore.update(guildId, { autoplay: enabled });
    }
    return null;
  }

  async set247(guildId, enabled) {
    if (this.settingsStore?.update) {
      return this.settingsStore.update(guildId, { twentyFourSeven: enabled });
    }
    return null;
  }

  getState(guildId) {
    return this.queueManager.getState(guildId);
  }

  getQueueManager() {
    return this.queueManager;
  }
}
