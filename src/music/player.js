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
      return null;
    }

    this.queueManager.setCurrentTrack(guildId, nextTrack);

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
    state.currentTrack = null;

    if (player) {
      await player.stopTrack();
    }

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

    await this.disconnect(guildId);
  }

  async disconnect(guildId) {
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
}
