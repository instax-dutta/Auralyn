import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { MusicPlayer } from '../src/music/player.js';
import forcefix from '../src/commands/forcefix.js';
import { createInteraction } from './helpers/discord-interaction.js';

class FakeLavalinkPlayer extends EventEmitter {
  constructor() {
    super();
    this.played = [];
    this.volume = 100;
  }

  async playTrack(options) {
    this.played.push(options.track.encoded);
  }

  async stopTrack() {}
  async destroy() {}
  async setPaused() {}
  async setGlobalVolume(volume) {
    this.volume = volume;
  }

  async setFilters() {}
}

class FakeShoukaku {
  constructor() {
    this.player = new FakeLavalinkPlayer();
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

function createClient() {
  const shoukaku = new FakeShoukaku();
  const musicPlayer = new MusicPlayer(shoukaku);
  const client = {
    musicPlayer,
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  };
  musicPlayer.settingsStore = {
    async get() {
      return { djModeEnabled: true, djRoleIds: [] };
    },
  };
  return { client, shoukaku, musicPlayer };
}

const adminInteraction = () => {
  const interaction = createInteraction({ guildId: 'guild', member: { roles: { cache: new Map() } } });
  interaction.options = { getString: () => null };
  return interaction;
};

test('forcefix preserves the original queue order', async () => {
  const { client, musicPlayer } = createClient();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await musicPlayer.enqueue({ guildId: 'guild', track: track('two'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await musicPlayer.enqueue({ guildId: 'guild', track: track('three'), textChannel: {}, voiceChannel: { id: 'voice-1' } });

  const before = musicPlayer.getQueue('guild').map(item => item.encoded);
  assert.deepEqual(before, ['encoded-two', 'encoded-three']);

  const interaction = adminInteraction();
  await forcefix.execute(interaction, client, null);

  const after = musicPlayer.getQueue('guild').map(item => item.encoded);
  assert.deepEqual(after, before, 'forcefix reordered the queue');
});

test('forcefix resumes playback after restoring the queue', async () => {
  const { client, musicPlayer } = createClient();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await musicPlayer.enqueue({ guildId: 'guild', track: track('two'), textChannel: {}, voiceChannel: { id: 'voice-1' } });

  const interaction = adminInteraction();
  await forcefix.execute(interaction, client, null);

  assert.equal(
    musicPlayer.getPlayerState('guild').isPlaying,
    true,
    'forcefix restored the queue but never resumed playback',
  );
});

test('forcefix restores the current track as the current track', async () => {
  const { client, musicPlayer } = createClient();

  await musicPlayer.enqueue({ guildId: 'guild', track: track('one'), textChannel: {}, voiceChannel: { id: 'voice-1' } });
  await musicPlayer.enqueue({ guildId: 'guild', track: track('two'), textChannel: {}, voiceChannel: { id: 'voice-1' } });

  const interaction = adminInteraction();
  await forcefix.execute(interaction, client, null);

  assert.equal(
    musicPlayer.getPlayerState('guild').currentTrack?.encoded,
    'encoded-one',
    'the previously playing track was not restored as the current track',
  );
});