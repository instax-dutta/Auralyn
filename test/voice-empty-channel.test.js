import test from 'node:test';
import assert from 'node:assert/strict';

import { Collection } from 'discord.js';

import voiceStateUpdate from '../src/events/voiceStateUpdate.js';

const BOT_ID = 'bot-1';

/**
 * Builds the gateway payload for "the last human left the bot's channel".
 * The handler is exercised through its real event shape so a change in how it
 * detects emptiness cannot silently pass.
 */
function emptyChannelScenario({ stayInVC = false, humanCount = 0 } = {}) {
  const botVoiceState = { channelId: 'voice-1' };
  const botUser = { id: BOT_ID, bot: true };
  const humanUsers = Array.from({ length: humanCount }, (_, index) => ({
    id: `human-${index}`,
    bot: false,
  }));

  // discord.js hands the handler a Collection, whose filter() returns a
  // Collection with .size; a bare Map would not match the real shape.
  const channelMembers = new Collection([
    [BOT_ID, { user: botUser }],
    ...humanUsers.map(user => [user.id, { user }]),
  ]);

  const channel = {
    id: 'voice-1',
    isVoiceBased: () => true,
    members: channelMembers,
  };

  const guild = {
    id: 'guild-1',
    voiceStates: { cache: new Collection([[BOT_ID, botVoiceState]]) },
    channels: { cache: new Collection([['voice-1', channel]]) },
  };

  const calls = [];
  const client = {
    user: { id: BOT_ID },
    guilds: { cache: new Map([['guild-1', guild]]) },
    logger: { debug() {}, error() {} },
    telemetry: { trackVoiceDisconnected() {} },
    musicPlayer: {
      getPlayerState: () => ({ stayInVC, textChannel: null }),
      disconnect: async guildId => { calls.push(['disconnect', guildId]); },
      stop: async guildId => { calls.push(['stop', guildId]); },
      cleanupGuild() {},
      players: new Map(),
      queueManager: { getState: () => ({ preserveQueueOnLeave: false }) },
    },
  };

  const oldState = { guild, channelId: 'voice-1', member: { user: humanUsers[0] ?? null } };
  const newState = { guild, channelId: null, member: { user: humanUsers[0] ?? null } };

  return { oldState, newState, client, calls };
}

test('an empty channel leaves the queue intact', async () => {
  const { oldState, newState, client, calls } = emptyChannelScenario();

  await voiceStateUpdate.execute(oldState, newState, client);

  assert.deepEqual(calls, [['disconnect', 'guild-1']],
    `an empty channel must disconnect, not destroy the queue; saw ${JSON.stringify(calls)}`);
});

test('a channel that still has listeners changes nothing', async () => {
  const { oldState, newState, client, calls } = emptyChannelScenario({ humanCount: 1 });

  await voiceStateUpdate.execute(oldState, newState, client);

  assert.deepEqual(calls, [], `left the channel while ${1} human was still present`);
});

test('24/7 mode keeps the bot in the empty channel', async () => {
  const { oldState, newState, client, calls } = emptyChannelScenario({ stayInVC: true });

  await voiceStateUpdate.execute(oldState, newState, client);

  assert.deepEqual(calls, [], '24/7 mode left the channel anyway');
});

test('unrelated channel churn never touches the player', async () => {
  const { oldState, client, calls } = emptyChannelScenario();

  // A member moving between two channels that are not the bot's channel.
  const before = { ...oldState, channelId: 'voice-2' };
  const after = { ...oldState, channelId: 'voice-3' };

  await voiceStateUpdate.execute(before, after, client);

  assert.deepEqual(calls, [], 'a move between unrelated channels changed the player');
});

test('the bot leaving the channel runs the bot path, not the empty-channel path', async () => {
  const { oldState, newState, client, calls } = emptyChannelScenario();

  // Same channel transition, but the subject is the bot itself.
  const botDeparture = {
    ...oldState,
    member: { user: { id: BOT_ID, bot: true } },
  };
  const botDepartalState = { ...newState, member: { user: { id: BOT_ID, bot: true } } };

  await voiceStateUpdate.execute(botDeparture, botDepartalState, client);

  assert.deepEqual(calls, [],
    'the bot moving out of its own channel re-entered the empty-channel path');
});