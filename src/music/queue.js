import { createSilentLogger } from '../utils/logger.js';
import { DEFAULT_FILTER } from '../utils/audio-filters.js';

const LOOP_OFF = 0;
const LOOP_TRACK = 1;
const LOOP_QUEUE = 2;

export { LOOP_OFF, LOOP_TRACK, LOOP_QUEUE };

export class QueueManager {
  constructor(logger = createSilentLogger()) {
    this.logger = logger;
    this.players = new Map();
  }

  getState(guildId) {
    if (!this.players.has(guildId)) {
      this.players.set(guildId, {
        queue: [],
        currentTrack: null,
        history: [],
        isPlaying: false,
        isPaused: false,
        volume: 70,
        loopMode: LOOP_OFF,
        filterPreset: DEFAULT_FILTER,
        autoplay: false,
        textChannel: null,
        voiceChannel: null,
        lavalinkPlayer: null,
        listeners: null,
        stayInVC: false,
      });
    }
    return this.players.get(guildId);
  }

  enqueue(guildId, track) {
    const state = this.getState(guildId);
    state.queue.push(track);
    this.logger.info(`Enqueued: ${track?.info?.title ?? 'unknown'}`);
    return state;
  }

  enqueueBulk(guildId, tracks) {
    const state = this.getState(guildId);
    state.queue.push(...tracks);
    this.logger.info(`Enqueued ${tracks.length} tracks`);
  }

  enqueueFront(guildId, track) {
    const state = this.getState(guildId);
    state.queue.unshift(track);
    this.logger.info(`Enqueued front: ${track?.info?.title ?? 'unknown'}`);
    return state;
  }

  removeBefore(guildId, position) {
    const state = this.getState(guildId);
    const index = position - 1;
    if (!Number.isInteger(index) || index < 1 || index > state.queue.length) return;
    state.queue.splice(0, index);
  }

  getNextTrack(state) {
    if (state.loopMode === LOOP_TRACK && state.currentTrack) {
      return state.currentTrack;
    }
    return state.queue.shift() ?? null;
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

  move(guildId, from, to) {
    const state = this.getState(guildId);
    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= state.queue.length) return null;
    if (toIndex < 0 || toIndex >= state.queue.length) return null;
    const [track] = state.queue.splice(fromIndex, 1);
    state.queue.splice(toIndex, 0, track);
    return track;
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

  pushToHistory(guildId, track) {
    if (!track) return;
    const state = this.getState(guildId);
    state.history.unshift(track);
    if (state.history.length > 10) state.history.pop();
  }

  getHistory(guildId) {
    return this.getState(guildId).history;
  }

  clearQueue(guildId) {
    this.getState(guildId).queue = [];
  }

  jumpTo(guildId, position) {
    const state = this.getState(guildId);
    const index = position - 1;
    if (index < 0 || index >= state.queue.length) return false;
    state.queue.splice(0, index);
    return true;
  }

  onTrackEnd(guildId) {
    const state = this.getState(guildId);
    if (state.currentTrack) this.pushToHistory(guildId, state.currentTrack);
    if (state.loopMode === LOOP_QUEUE && state.currentTrack) {
      state.queue.push(state.currentTrack);
    }
  }

  cleanup(guildId) {
    this.players.delete(guildId);
  }

  getFilterPreset(guildId) {
    return this.getState(guildId).filterPreset;
  }

  setFilterPreset(guildId, preset) {
    this.getState(guildId).filterPreset = preset;
  }

  getStayInVC(guildId) {
    return this.getState(guildId).stayInVC;
  }

  setStayInVC(guildId, enabled) {
    this.getState(guildId).stayInVC = enabled;
  }

  getAutoplay(guildId) {
    return this.getState(guildId).autoplay;
  }

  setAutoplay(guildId, enabled) {
    this.getState(guildId).autoplay = enabled;
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
      filterPreset: state.filterPreset,
      autoplay: state.autoplay,
      stayInVC: state.stayInVC,
    };
  }
}
