const LOOP_MODE = {
  OFF: 0,
  TRACK: 1,
  QUEUE: 2,
};

const END_REASONS_THAT_SHOULD_ADVANCE = new Set(['finished', 'loadFailed']);

export class MusicPlayer {
  constructor(shoukaku) {
    this.shoukaku = shoukaku;
    this.players = new Map();
  }

  getPlayerState(guildId) {
    if (!this.players.has(guildId)) {
      this.players.set(guildId, {
        queue: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        volume: 100,
        loopMode: LOOP_MODE.OFF,
        textChannel: null,
        voiceChannel: null,
        lavalinkPlayer: null,
        listeners: null,
      });
    }

    return this.players.get(guildId);
  }

  async enqueue({ guildId, track, textChannel, voiceChannel }) {
    const state = this.getPlayerState(guildId);
    state.textChannel = textChannel;
    state.voiceChannel = voiceChannel;
    state.queue.push(track);

    if (!state.isPlaying) {
      await this.playNext(guildId);
    }

    return state;
  }

  async play(guildId, track, textChannel, voiceChannel) {
    return this.enqueue({ guildId, track, textChannel, voiceChannel });
  }

  async getOrCreateLavalinkPlayer(guildId) {
    const state = this.getPlayerState(guildId);
    if (state.lavalinkPlayer) return state.lavalinkPlayer;
    if (!state.voiceChannel) {
      throw new Error('Cannot create Lavalink player without a voice channel.');
    }

    const player = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId: state.voiceChannel.id,
      shardId: state.voiceChannel.guild?.shardId ?? 0,
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
    state.listeners = listeners;
    return player;
  }

  async playNext(guildId) {
    const state = this.getPlayerState(guildId);
    const nextTrack = this.getNextTrack(state);

    if (!nextTrack) {
      state.currentTrack = null;
      state.isPlaying = false;
      state.isPaused = false;
      return null;
    }

    state.currentTrack = nextTrack;
    state.isPlaying = true;
    state.isPaused = false;

    const player = await this.getOrCreateLavalinkPlayer(guildId);
    await player.playTrack({ track: { encoded: nextTrack.encoded } });
    return nextTrack;
  }

  getNextTrack(state) {
    if (state.loopMode === LOOP_MODE.TRACK && state.currentTrack) {
      return state.currentTrack;
    }

    return state.queue.shift() ?? null;
  }

  async handleTrackEnd(guildId, event = {}) {
    const state = this.getPlayerState(guildId);
    if (!state.isPlaying) return;
    if (!END_REASONS_THAT_SHOULD_ADVANCE.has(event.reason ?? 'finished')) return;

    if (state.loopMode === LOOP_MODE.QUEUE && state.currentTrack) {
      state.queue.push(state.currentTrack);
    }

    await this.playNext(guildId);
  }

  async handleTrackProblem(guildId, event) {
    console.error(`Track problem in guild ${guildId}:`, event);
    await this.skip(guildId);
  }

  async handleConnectionClosed(guildId, event) {
    console.warn(`Voice connection closed in guild ${guildId}:`, event);
    await this.stop(guildId);
  }

  async skip(guildId) {
    const state = this.getPlayerState(guildId);
    if (!state.currentTrack && state.queue.length === 0) return null;

    const player = state.lavalinkPlayer;
    state.currentTrack = null;

    if (player) {
      await player.stopTrack();
    }

    return this.playNext(guildId);
  }

  async stop(guildId) {
    const state = this.getPlayerState(guildId);
    state.queue = [];
    state.currentTrack = null;
    state.isPlaying = false;
    state.isPaused = false;

    if (state.lavalinkPlayer) {
      try {
        await state.lavalinkPlayer.stopTrack();
      } catch (error) {
        console.error(`Failed to stop Lavalink player in guild ${guildId}:`, error);
      }
    }

    await this.disconnect(guildId);
  }

  async disconnect(guildId) {
    this.cleanupGuild(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.players.delete(guildId);
  }

  cleanupGuild(guildId) {
    const state = this.players.get(guildId);
    if (!state?.listeners || !state.lavalinkPlayer) return;

    for (const [event, listener] of Object.entries(state.listeners)) {
      state.lavalinkPlayer.off(event, listener);
    }

    state.listeners = null;
    state.lavalinkPlayer = null;
  }

  async pause(guildId) {
    const state = this.getPlayerState(guildId);
    if (!state.isPlaying || state.isPaused || !state.lavalinkPlayer) return false;

    await state.lavalinkPlayer.setPaused(true);
    state.isPaused = true;
    return true;
  }

  async resume(guildId) {
    const state = this.getPlayerState(guildId);
    if (!state.isPlaying || !state.isPaused || !state.lavalinkPlayer) return false;

    await state.lavalinkPlayer.setPaused(false);
    state.isPaused = false;
    return true;
  }

  async setVolume(guildId, volume) {
    const state = this.getPlayerState(guildId);
    const safeVolume = Math.max(1, Math.min(100, Number(volume)));
    state.volume = safeVolume;

    if (state.lavalinkPlayer) {
      await state.lavalinkPlayer.setGlobalVolume(safeVolume);
    }

    return safeVolume;
  }

  shuffle(guildId) {
    const state = this.getPlayerState(guildId);
    for (let i = state.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
    }

    return state.queue;
  }

  setLoopMode(guildId, mode) {
    const state = this.getPlayerState(guildId);
    if (!Object.values(LOOP_MODE).includes(mode)) {
      throw new Error(`Invalid loop mode: ${mode}`);
    }

    state.loopMode = mode;
    return mode;
  }

  remove(guildId, position) {
    const state = this.getPlayerState(guildId);
    const index = position - 1;
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
      return null;
    }

    return state.queue.splice(index, 1)[0];
  }

  getQueue(guildId) {
    return this.getPlayerState(guildId).queue;
  }

  getCurrentTrack(guildId) {
    return this.getPlayerState(guildId).currentTrack;
  }
}
