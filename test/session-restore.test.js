import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import readyEvent from '../src/events/ready.js';
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
  }

  async joinVoiceChannel(options) { this.joined.push(options); return this.player; }
  async leaveVoiceChannel(guildId) { this.left.push(guildId); }
}

const track = (id) => ({
  encoded: `encoded-${id}`,
  info: { title: `Track ${id}`, author: 'Artist', length: 120000, uri: `https://example.com/${id}`, artworkUrl: null },
  requestedByUserId: null,
  requestedByName: null,
});

const silent = () => ({ info() {}, warn() {}, error() {}, debug() {} });

async function createHarness() {
  const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'auralyn-restore-')), 'sessions.json');
  const sessionStore = new JsonSessionStore({ filePath });
  const shoukaku = new FakeShoukaku();
  const musicPlayer = new MusicPlayer(shoukaku, { ...silent(), child: silent }, { sessionStore });

  const channels = new Map([
    ['text-1', { id: 'text-1', send: async () => ({ edit: async () => {} }) }],
    ['voice-1', { id: 'voice-1', isVoiceBased: () => true }],
  ]);

  const guild = {
    id: 'guild-a',
    // Independent copy: a test may clear the guild view without touching the
    // global channel cache restore reads from.
    channels: { cache: new Map(channels) },
    members: { me: { voice: { channelId: 'voice-1' } } },
  };

  const client = {
    user: { tag: 'Auralyn#0', setActivity: async () => {} },
    guilds: { cache: new Map([['guild-a', guild]]) },
    // Discord.js exposes every visible channel here; restore reads from it.
    channels: { cache: new Map(channels) },
    musicPlayer,
    logger: silent(),
    telemetry: null,
    shoukaku,
  };

  return { client, musicPlayer, sessionStore, shoukaku, guild };
}

const persist = (sessionStore, guildId, snapshot) =>
  sessionStore.save(guildId, {
    guildId,
    queue: snapshot.queue ?? [],
    currentTrack: snapshot.currentTrack ?? null,
    volume: snapshot.volume ?? 80,
    loopMode: snapshot.loopMode ?? 0,
    textChannelId: snapshot.textChannelId ?? 'text-1',
    voiceChannelId: snapshot.voiceChannelId ?? 'voice-1',
    updatedAt: new Date().toISOString(),
  });

test('a restart restores the queued tracks', async () => {
  const { client, musicPlayer, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', { queue: [track('one'), track('two')] });

  await readyEvent.execute(client, null, client.shoukaku);

  assert.deepEqual(
    musicPlayer.getQueue('guild-a').map(t => t.info.title),
    ['Track one', 'Track two'],
    'the queue was lost across a restart',
  );
});

test('a restart restores the current track and playback settings', async () => {
  const { client, musicPlayer, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', {
    currentTrack: track('now'),
    volume: 33,
    loopMode: 2,
  });

  await readyEvent.execute(client, null, client.shoukaku);

  const state = musicPlayer.getPlayerState('guild-a');
  assert.equal(state.currentTrack?.info.title, 'Track now');
  assert.equal(state.volume, 33);
  assert.equal(state.loopMode, 2);
});

test('a restart does not connect to voice', async () => {
  const { client, shoukaku, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', { queue: [track('one')], currentTrack: track('now') });

  await readyEvent.execute(client, null, shoukaku);

  assert.deepEqual(shoukaku.joined, [], 'restore connected to voice instead of waiting for Lavalink');
});

test('a restored guild is not playing until Lavalink is ready', async () => {
  const { client, musicPlayer, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', { currentTrack: track('now') });

  await readyEvent.execute(client, null, client.shoukaku);

  assert.equal(
    musicPlayer.getPlayerState('guild-a').isPlaying,
    false,
    'a restored guild reported playing before any transport existed',
  );
});

test('a stopped guild is not restored', async () => {
  const { client, musicPlayer, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', { queue: [track('one')] });
  await sessionStore.delete('guild-a');

  await readyEvent.execute(client, null, client.shoukaku);

  assert.deepEqual(musicPlayer.getQueue('guild-a'), [], 'a deliberately stopped guild was restored');
});

test('a guild with no stored session is left at defaults', async () => {
  const { client, musicPlayer } = await createHarness();

  await readyEvent.execute(client, null, client.shoukaku);

  const state = musicPlayer.getPlayerState('guild-a');
  assert.deepEqual(state.queue, []);
  assert.equal(state.currentTrack, null);
});

test('a stored channel that no longer exists does not break restore', async () => {
  const { client, musicPlayer, sessionStore, guild } = await createHarness();
  guild.channels.cache.clear();
  await persist(sessionStore, 'guild-a', { queue: [track('one')] });

  await readyEvent.execute(client, null, client.shoukaku);

  assert.deepEqual(
    musicPlayer.getQueue('guild-a').map(t => t.info.title),
    ['Track one'],
    'a missing text/voice channel discarded the restored queue',
  );
});

test('reattach resumes the current track once Lavalink is ready', async () => {
  const { client, musicPlayer, shoukaku, sessionStore } = await createHarness();
  await persist(sessionStore, 'guild-a', { currentTrack: track('now'), queue: [track('next')] });

  await readyEvent.execute(client, null, shoukaku);
  assert.deepEqual(shoukaku.joined, [], 'precondition: restore should not connect');

  await musicPlayer.reattachRestored();

  assert.equal(shoukaku.joined.length, 1, 'reattach did not join the voice channel');
  assert.equal(shoukaku.joined[0].channelId, 'voice-1');
  assert.deepEqual(
    shoukaku.player.played,
    ['encoded-now'],
    'reattach did not resume the restored track',
  );
  assert.equal(musicPlayer.getPlayerState('guild-a').isPlaying, true);
});

test('reattach with nothing restored is a no-op', async () => {
  const { musicPlayer, shoukaku } = await createHarness();

  await musicPlayer.reattachRestored();

  assert.deepEqual(shoukaku.joined, []);
});