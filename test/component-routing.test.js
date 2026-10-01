import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';

import interactionCreate from '../src/events/interactionCreate.js';
import { createInteraction } from './helpers/discord-interaction.js';

function buttonInteraction(customId, overrides = {}) {
  const interaction = createInteraction({
    customId,
    guildId: 'guild-1',
    channelId: 'text-1',
    ...overrides,
  });
  interaction.isButton = () => true;
  interaction.isChatInputCommand = () => false;
  interaction.user = { id: overrides.userId ?? 'user-1' };
  interaction.member = { roles: { cache: new Map() } };
  interaction.message = { id: 'message-1' };
  interaction.followUp = async payload => {
    interaction.state.followUpPayload = payload;
    return interaction;
  };
  return interaction;
}

function createClient() {
  const calls = [];
  return {
    calls,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    commands: new Map(),
    likedStore: {
      async clearLikedSongs() {
        calls.push(['clearLiked', 'user-1']);
        return 3;
      },
    },
    musicPlayer: {
      settingsStore: { async update() {} },
      getPlayerState: () => ({ isPaused: false, loopMode: 0, currentTrack: null }),
      async skip() { calls.push(['skip']); },
      async pause() { calls.push(['pause']); },
      async resume() { calls.push(['resume']); },
      async stop() { calls.push(['stop']); },
      setLoopMode() { calls.push(['loop']); },
    },
    rest: { async patch() { calls.push(['patch']); return {}; } },
  };
}

test('a playlist button is routed on its guild segment, not its third segment', async () => {
  const client = createClient();
  let executed = false;
  client.commands.set('playlist', {
    data: { name: 'playlist' },
    async execute() {
      executed = true;
    },
  });

  const interaction = buttonInteraction('auralyn:pl:page:user-1:Road Trip:2');

  await interactionCreate.execute(interaction, client, null);

  assert.equal(executed, true, 'playlist pagination button was rejected instead of routed');
});

test('auralyn:voteskip-yes is routed to the active vote, not rejected as cross-guild', async () => {
  const client = createClient();
  const seen = [];
  client.onVoteSkip = async (guildId, vote, voterId) => {
    seen.push([guildId, vote, voterId]);
  };

  const interaction = buttonInteraction('auralyn:voteskip-yes');

  await interactionCreate.execute(interaction, client, null);

  assert.deepEqual(seen, [['guild-1', 'yes', 'user-1']], 'voteskip button was not routed');
  assert.ok(!interaction.state.replyPayload, 'voteskip button was rejected as foreign');
});

test('a button from a different guild is rejected', async () => {
  const client = createClient();
  const interaction = buttonInteraction('auralyn:skip:guild-2', { guildId: 'guild-1' });

  await interactionCreate.execute(interaction, client, null);

  assert.equal(client.calls.length, 0, 'a foreign-guild button reached playback control');
  assert.ok(interaction.state.replyPayload, 'foreign-guild button produced no response');
  assert.equal(interaction.state.replyPayload.flags & MessageFlags.Ephemeral, MessageFlags.Ephemeral);
});

test('a playlist pagination button for another user is rejected', async () => {
  const client = createClient();
  let executed = false;
  client.commands.set('playlist', {
    data: { name: 'playlist' },
    async execute() {
      executed = true;
    },
  });

  const interaction = buttonInteraction('auralyn:pl:page:user-2:Road Trip:2', { userId: 'user-1' });
  await interactionCreate.execute(interaction, client, null);

  assert.equal(executed, false, 'another user controlled this playlist view');
  assert.ok(interaction.state.replyPayload);
});

test('a liked pagination button for another user is rejected', async () => {
  const client = createClient();
  let executed = false;
  client.commands.set('liked', {
    data: { name: 'liked' },
    async execute() {
      executed = true;
    },
  });

  const interaction = buttonInteraction('auralyn:liked:page:user-2:1', { userId: 'user-1' });
  await interactionCreate.execute(interaction, client, null);

  assert.equal(executed, false, 'another user controlled this liked-songs view');
  assert.ok(interaction.state.replyPayload);
});

test('clear-liked for another user does not clear anything', async () => {
  const client = createClient();
  const interaction = buttonInteraction('auralyn:liked:clear:confirm:user-2', { userId: 'user-1' });

  await interactionCreate.execute(interaction, client, null);

  assert.deepEqual(client.calls, [], 'another user cleared this liked-songs list');
  assert.ok(interaction.state.replyPayload);
});

test('clear-liked by the owner does clear', async () => {
  const client = createClient();
  const interaction = buttonInteraction('auralyn:liked:clear:confirm:user-1', { userId: 'user-1' });

  await interactionCreate.execute(interaction, client, null);

  assert.deepEqual(client.calls, [['clearLiked', 'user-1']]);
});