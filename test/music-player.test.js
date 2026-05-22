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

const track = (id) => ({
  encoded: `encoded-${id}`,
  info: {
    title: `Track ${id}`,
    author: 'Artist',
    length: 120000,
    uri: `https://example.com/${id}`,
    artworkUrl: null,
  },
});

test('skip advances to exactly the next track', async () => {
  const lavalinkPlayer = new FakeLavalinkPlayer();
  const musicPlayer = new MusicPlayer(new FakeShoukaku(lavalinkPlayer));

  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('one'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });
  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('two'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });

  await musicPlayer.skip('guild');

  assert.deepEqual(lavalinkPlayer.played, ['encoded-one', 'encoded-two']);
  assert.equal(musicPlayer.getCurrentTrack('guild').info.title, 'Track two');
  assert.equal(musicPlayer.getQueue('guild').length, 0);
});

test('queue loop re-adds finished tracks after the remaining queue', async () => {
  const lavalinkPlayer = new FakeLavalinkPlayer();
  const musicPlayer = new MusicPlayer(new FakeShoukaku(lavalinkPlayer));

  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('one'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });
  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('two'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });

  await musicPlayer.setLoopMode('guild', 2);
  await musicPlayer.handleTrackEnd('guild', { reason: 'finished' });

  assert.deepEqual(lavalinkPlayer.played, ['encoded-one', 'encoded-two']);
  assert.equal(musicPlayer.getCurrentTrack('guild').info.title, 'Track two');
  assert.deepEqual(musicPlayer.getQueue('guild').map((item) => item.info.title), ['Track one']);
});

test('remove uses one-based queue positions', async () => {
  const musicPlayer = new MusicPlayer(new FakeShoukaku());

  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('one'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });
  await musicPlayer.enqueue({
    guildId: 'guild',
    track: track('two'),
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });

  const removed = musicPlayer.remove('guild', 1);

  assert.equal(removed.info.title, 'Track two');
  assert.equal(musicPlayer.getQueue('guild').length, 0);
});

test('enqueue applies default guild volume and preserves requester metadata', async () => {
  const lavalinkPlayer = new FakeLavalinkPlayer();
  const settingsStore = {
    async get() {
      return {
        defaultVolume: 55,
      };
    },
  };
  const musicPlayer = new MusicPlayer(new FakeShoukaku(lavalinkPlayer), undefined, { settingsStore });

  await musicPlayer.enqueue({
    guildId: 'guild',
    track: {
      ...track('one'),
      requestedByUserId: 'user-1',
      requestedByName: 'R4C3R',
    },
    textChannel: { id: 'text-1' },
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });

  const state = musicPlayer.getPlayerState('guild');
  assert.equal(state.currentTrack.requestedByUserId, 'user-1');
  assert.equal(state.currentTrack.requestedByName, 'R4C3R');
  assert.equal(state.volume, 55);
  assert.equal(lavalinkPlayer.volume, 55);
});

test('enqueue and stop persist and clear snapshots when session store is configured', async () => {
  const sessionWrites = [];
  const sessionDeletes = [];
  const sessionStore = {
    async save(guildId, snapshot) {
      sessionWrites.push({ guildId, snapshot });
    },
    async delete(guildId) {
      sessionDeletes.push(guildId);
    },
  };
  const musicPlayer = new MusicPlayer(new FakeShoukaku(), undefined, { sessionStore });

  await musicPlayer.enqueue({
    guildId: 'guild',
    track: {
      ...track('one'),
      requestedByUserId: 'user-1',
    },
    textChannel: { id: 'text-1' },
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
  });

  assert.equal(sessionWrites.length >= 1, true);
  assert.equal(sessionWrites.at(-1).guildId, 'guild');
  assert.equal(sessionWrites.at(-1).snapshot.currentTrack.requestedByUserId, 'user-1');

  await musicPlayer.stop('guild');
  assert.deepEqual(sessionDeletes, ['guild']);
});

test('enqueuePlaylist batches with progress callbacks and starts playback once', async () => {
  const lavalinkPlayer = new FakeLavalinkPlayer();
  const musicPlayer = new MusicPlayer(new FakeShoukaku(lavalinkPlayer));

  const tracks = Array.from({ length: 25 }, (_, i) => track(`p${i}`));
  const progressCalls = [];

  const result = await musicPlayer.enqueuePlaylist({
    guildId: 'guild',
    tracks,
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
    batchSize: 10,
    batchDelayMs: 0,
    onProgress: ({ enqueued, total }) => {
      progressCalls.push({ enqueued, total });
    },
  });

  assert.equal(result.total, 25);
  assert.equal(result.enqueued, 25);
  assert.equal(result.aborted, false);

  // Progress fires after every batch: 10, 20, 25
  assert.deepEqual(progressCalls.map(p => p.enqueued), [10, 20, 25]);
  assert.deepEqual(progressCalls.map(p => p.total), [25, 25, 25]);

  // First track was kicked off for playback
  await new Promise(r => setTimeout(r, 10));
  assert.equal(lavalinkPlayer.played[0], 'encoded-p0');

  // Queue depth + current track == total
  const state = musicPlayer.getState('guild');
  assert.equal((state.queue?.length ?? 0) + (state.currentTrack ? 1 : 0), 25);
});

test('enqueuePlaylist aborts gracefully when the guild session is cleaned up', async () => {
  const musicPlayer = new MusicPlayer(new FakeShoukaku());

  const tracks = Array.from({ length: 30 }, (_, i) => track(`a${i}`));

  const result = await musicPlayer.enqueuePlaylist({
    guildId: 'guild',
    tracks,
    textChannel: {},
    voiceChannel: { id: 'voice', guild: { shardId: 0 } },
    batchSize: 10,
    batchDelayMs: 0,
    onProgress: async ({ enqueued }) => {
      // Wipe the guild state mid-load after the first batch
      if (enqueued === 10) {
        musicPlayer.queueManager.cleanup('guild');
      }
    },
  });

  assert.equal(result.aborted, true);
  assert.ok(result.enqueued < 30, 'should not have enqueued all tracks after abort');
});
