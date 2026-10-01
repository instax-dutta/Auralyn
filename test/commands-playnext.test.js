import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { MusicPlayer } from '../src/music/player.js';

class FakeLavalinkPlayer extends EventEmitter {
  constructor() {
    super();
    this.played = [];
    this.stopped = 0;
    this.destroyed = 0;
    this.paused = false;
    this.volume = 100;
  }

  async playTrack(options) {
    this.played.push(options.track.encoded);
  }

  async stopTrack() {
    this.stopped += 1;
  }

  async destroy() {
    this.destroyed += 1;
  }

  async setPaused(paused) {
    this.paused = paused;
  }

  async setGlobalVolume(volume) {
    this.volume = volume;
  }

  async setFilters() {}
}

class FakeShoukaku {
  constructor(player = new FakeLavalinkPlayer()) {
    this.player = player;
    this.joined = [];
    this.left = [];
  }

  async joinVoiceChannel(options) {
    this.joined.push(options);
    return this.player;
  }

  async leaveVoiceChannel(guildId) {
    this.left.push(guildId);
    await this.player.destroy();
  }
}

const track = (id, extra = {}) => ({
  encoded: `encoded-${id}`,
  info: {
    title: `Track ${id}`,
    author: 'Artist',
    length: 120000,
    uri: `https://example.com/${id}`,
    artworkUrl: null,
  },
  ...extra,
});

const front = (musicPlayer, id, extra = {}) => musicPlayer.enqueueFront({
  guildId: 'guild',
  track: track(id, extra),
  textChannel: { id: 'text-1' },
  voiceChannel: { id: 'voice-1' },
});

function createPlayer() {
  const lavalinkPlayer = new FakeLavalinkPlayer();
  return { lavalinkPlayer, musicPlayer: new MusicPlayer(new FakeShoukaku(lavalinkPlayer)) };
}

test('enqueueFront accepts the same options object as enqueue', async () => {
  const { musicPlayer } = createPlayer();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await musicPlayer.enqueue({ guildId: 'guild', track: track('two'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await front(musicPlayer, 'three');

  assert.deepEqual(
    [...musicPlayer.players.keys()],
    ['guild'],
    'enqueueFront created a player state keyed by something other than the guild id',
  );
  assert.deepEqual(
    musicPlayer.getQueue('guild').map(item => item.encoded),
    ['encoded-three', 'encoded-two'],
    'enqueueFront did not insert ahead of the queued tracks',
  );
});

test('enqueueFront starts playback when the guild is idle', async () => {
  const { musicPlayer, lavalinkPlayer } = createPlayer();

  await front(musicPlayer, 'one');

  const state = musicPlayer.getPlayerState('guild');
  assert.equal(state.isPlaying, true, 'idle guild did not start playback after enqueueFront');
  assert.equal(state.currentTrack?.encoded, 'encoded-one');
  assert.deepEqual(lavalinkPlayer.played, ['encoded-one']);
});

test('enqueueFront attaches requester metadata like enqueue does', async () => {
  const { musicPlayer } = createPlayer();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await front(musicPlayer, 'two', { requestedByUserId: 'user-9', requestedByName: 'Requester' });

  const queued = musicPlayer.getQueue('guild').find(item => item.encoded === 'encoded-two');
  assert.equal(queued.requestedByUserId, 'user-9');
  assert.equal(queued.requestedByName, 'Requester');
});

test('enqueueFront normalises a missing requester to null like enqueue does', async () => {
  const { musicPlayer } = createPlayer();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await front(musicPlayer, 'two');

  const queued = musicPlayer.getQueue('guild').find(item => item.encoded === 'encoded-two');
  assert.equal(queued.requestedByUserId, null);
  assert.equal(queued.requestedByName, null);
});