import { createSilentLogger } from '../utils/logger.js';

const LOOP_OFF = 0;
const LOOP_TRACK = 1;
const LOOP_QUEUE = 2;

export { LOOP_OFF, LOOP_TRACK, LOOP_QUEUE };

const MAX_HISTORY = 10;

export class QueueManager {
  constructor(logger = createSilentLogger()) {
    this.logger = logger;
    this.players = new Map();
  }

  getState(guildId) {
    if (!this.players.has(guildId)) {
      this.players.set(guildId, {
        queue: [],
        history: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        volume: 100,
        loopMode: LOOP_OFF,
        textChannel: null,
        voiceChannel: null,
        lavalinkPlayer: null,
        listeners: null,
      });
    }
    return this.players.get(guildId);
  }

  enqueue(guildId, track) {
    const state = this.getState(guildId);
    state.queue.push(track);
    this.logger.debug(`Enqueued track for guild ${guildId}: ${track?.info?.title ?? 'unknown'}`);
    return state;
  }

  enqueueFront(guildId, track) {
    const state = this.getState(guildId);
    state.queue.unshift(track);
    this.logger.debug(`Prepended track for guild ${guildId}: ${track?.info?.title ?? 'unknown'}`);
    return state;
  }

  getNextTrack(state) {
    if (state.loopMode === LOOP_TRACK && state.currentTrack) {
      return state.currentTrack;
    }
    return state.queue.shift() ?? null;
  }

  skip(guildId) {
    const state = this.getState(guildId);
    return this.getNextTrack(state);
  }

  shuffle(guildId) {
    const state = this.getState(guildId);
    for (let i = state.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
    }
    return state.queue;
  }

  remove(guildId, position) {
    const state = this.getState(guildId);
    const index = position - 1;
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
      return null;
    }
    return state.queue.splice(index, 1)[0] ?? null;
  }

  removeBefore(guildId, position) {
    const state = this.getState(guildId);
    const index = position - 1;
    if (index < 0 || index >= state.queue.length) return;
    state.queue.splice(0, index);
  }

  clearQueue(guildId) {
    const state = this.getState(guildId);
    state.queue = [];
  }

  setLoopMode(guildId, mode) {
    const state = this.getState(guildId);
    if (![LOOP_OFF, LOOP_TRACK, LOOP_QUEUE].includes(mode)) {
      throw new Error(`Invalid loop mode: ${mode}`);
    }
    state.loopMode = mode;
    return mode;
  }

  setCurrentTrack(guildId, track) {
    const state = this.getState(guildId);
    state.currentTrack = track;
    state.isPlaying = Boolean(track);
    state.isPaused = false;
  }

  setPlaying(guildId, isPlaying) {
    this.getState(guildId).isPlaying = isPlaying;
  }

  setPaused(guildId, isPaused) {
    this.getState(guildId).isPaused = isPaused;
  }

  setVolume(guildId, volume) {
    this.getState(guildId).volume = Math.max(1, Math.min(100, Number(volume)));
  }

  getQueue(guildId) {
    return this.getState(guildId).queue;
  }

  getCurrentTrack(guildId) {
    return this.getState(guildId).currentTrack;
  }

  isPlaying(guildId) {
    return this.getState(guildId).isPlaying;
  }

  isPaused(guildId) {
    return this.getState(guildId).isPaused;
  }

  getVolume(guildId) {
    return this.getState(guildId).volume;
  }

  getLoopMode(guildId) {
    return this.getState(guildId).loopMode;
  }

  getTextChannel(guildId) {
    return this.getState(guildId).textChannel;
  }

  getVoiceChannel(guildId) {
    return this.getState(guildId).voiceChannel;
  }

  setTextChannel(guildId, channel) {
    this.getState(guildId).textChannel = channel;
  }

  setVoiceChannel(guildId, channel) {
    this.getState(guildId).voiceChannel = channel;
  }

  getLavalinkPlayer(guildId) {
    return this.getState(guildId).lavalinkPlayer;
  }

  setLavalinkPlayer(guildId, player) {
    this.getState(guildId).lavalinkPlayer = player;
  }

  getListeners(guildId) {
    return this.getState(guildId).listeners;
  }

  setListeners(guildId, listeners) {
    this.getState(guildId).listeners = listeners;
  }

  onTrackEnd(guildId) {
    const state = this.getState(guildId);
    if (state.loopMode === LOOP_QUEUE && state.currentTrack) {
      state.queue.push(state.currentTrack);
    }
  }

  pushHistory(guildId) {
    const state = this.getState(guildId);
    if (!state.currentTrack) return;
    state.history.push(state.currentTrack);
    if (state.history.length > MAX_HISTORY) {
      state.history.shift();
    }
  }

  popHistory(guildId) {
    const state = this.getState(guildId);
    return state.history.pop() ?? null;
  }

  getHistory(guildId) {
    return this.getState(guildId).history;
  }

  cleanup(guildId) {
    this.players.delete(guildId);
  }

  getSnapshot(guildId) {
    const state = this.getState(guildId);
    return {
      currentTrack: state.currentTrack,
      queue: state.queue,
      isPlaying: state.isPlaying,
      isPaused: state.isPaused,
      volume: state.volume,
      loopMode: state.loopMode,
    };
  }
}
