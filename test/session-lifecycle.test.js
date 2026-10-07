import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EventEmitter } from 'node:events';
import { MusicPlayer } from '../src/music/player.js';
import { JsonSessionStore } from '../src/utils/session-store.js';

class FakeLavalinkPlayer extends EventEmitter {
  constructor() {
    super();
    this.played = [];
    this.paused = false;
    this.volume = 100;
    this.filters = {};
  }

  async playTrack(options) { this.played.push(options.track.encoded); }
  async stopTrack() {}
  async destroy() {}
  async setPaused(value) { this.paused = value; }
  async setGlobalVolume(value) { this.volume = value; }
  async setFilters(filters) { this.filters = filters; }
}

class FakeShoukaku {
  constructor() {
    this.player = new FakeLavalinkPlayer();
    this.joined = [];
    this.left = [];
    this.nodes = new Map([['main', { state: 2 }]]);
  }

  async joinVoiceChannel(options) { this.joined.push(options); return this.player; }
  async leaveVoiceChannel(guildId) { this.left.push(guildId); }
}

const track = (id, extra = {}) => ({
  encoded: `encoded-${id}`,
  info: { title: `Track ${id}`, author: 'Artist', length: 120000, uri: `https://example.com/${id}`, artworkUrl: null },
  ...extra,
});

async function createPlayer() {
  const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'auralyn-life-')), 'sessions.json');
  const sessionStore = new JsonSessionStore({ filePath });
  const shoukaku = new FakeShoukaku();
  const silent = () => ({ info() {}, warn() {}, error() {}, debug() {} });
  const logger = { ...silent(), child: silent };
  const musicPlayer = new MusicPlayer(shoukaku, logger, { sessionStore });

  return { musicPlayer, sessionStore, shoukaku, filePath };
}

const seed = async (musicPlayer, guildId, ids) => {
  for (const id of ids) {
    await musicPlayer.enqueue({ guildId, track: track(id), textChannel: { id: 'text-1' }, voiceChannel: { id: 'voice-1' } });
  }
};

test('disconnect keeps the persisted session recoverable', async () => {
  const { musicPlayer, sessionStore } = await createPlayer();
  await seed(musicPlayer, 'guild-a', ['one', 'two']);

  await musicPlayer.persistGuildState('guild-a');
  assert.ok(await sessionStore.get('guild-a'), 'the session was not persisted before disconnect');

  await musicPlayer.disconnect('guild-a');

  const restored = await sessionStore.get('guild-a');
  assert.ok(restored, 'disconnect destroyed the persisted session');
  // Seeding two tracks leaves one playing and one queued.
  assert.equal(restored.currentTrack.info.title, 'Track one');
  assert.deepEqual(restored.queue.map(t => t.info.title), ['Track two']);
});

test('disconnect leaves no tombstone because it is recoverable', async () => {
  const { musicPlayer, sessionStore } = await createPlayer();
  await seed(musicPlayer, 'guild-a', ['one']);

  await musicPlayer.disconnect('guild-a');

  assert.equal(
    await sessionStore.wasStopped('guild-a'),
    false,
    'a recoverable disconnect was recorded as a destructive stop',
  );
});

test('disconnect flushes the current queue to disk', async () => {
  const { musicPlayer, sessionStore } = await createPlayer();
  // Three seeded tracks leave one playing and two queued.
  await seed(musicPlayer, 'guild-a', ['one', 'two', 'three']);

  await musicPlayer.disconnect('guild-a');

  const stored = await sessionStore.get('guild-a');
  assert.equal(stored.currentTrack.info.title, 'Track one');
  assert.deepEqual(
    stored.queue.map(t => t.info.title),
    ['Track two', 'Track three'],
    'the flush did not capture the live queue',
  );
});

test('stop is destructive and records a tombstone', async () => {
  const { musicPlayer, sessionStore } = await createPlayer();
  await seed(musicPlayer, 'guild-a', ['one', 'two']);

  await musicPlayer.stop('guild-a');

  assert.equal(await sessionStore.get('guild-a'), null, 'stop left a restorable session behind');
  assert.equal(await sessionStore.wasStopped('guild-a'), true, 'stop did not record a tombstone');
});

test('stop clears the in-memory queue', async () => {
  const { musicPlayer } = await createPlayer();
  await seed(musicPlayer, 'guild-a', ['one', 'two']);

  await musicPlayer.stop('guild-a');

  const state = musicPlayer.getPlayerState('guild-a');
  assert.deepEqual(state.queue, []);
  assert.equal(state.currentTrack, null);
  assert.equal(state.isPlaying, false);
});

test('shutdown keeps sessions recoverable', async () => {
  const { musicPlayer, sessionStore, shoukaku } = await createPlayer();
  await seed(musicPlayer, 'guild-a', ['one', 'two']);

  await musicPlayer.shutdown();

  const restored = await sessionStore.get('guild-a');
  assert.ok(restored, 'shutdown destroyed the persisted session');
  assert.equal(restored.currentTrack.info.title, 'Track one');
  assert.deepEqual(restored.queue.map(t => t.info.title), ['Track two']);
  assert.equal(await sessionStore.wasStopped('guild-a'), false, 'shutdown was recorded as a destructive stop');
  assert.deepEqual(shoukaku.left, ['guild-a'], 'shutdown did not leave the voice channel');
});

test('shutdown on an idle player does not throw', async () => {
  const { musicPlayer, sessionStore } = await createPlayer();

  await musicPlayer.shutdown();

  assert.equal(await sessionStore.get('guild-a'), null);
  assert.equal(await sessionStore.wasStopped('guild-a'), false);
});