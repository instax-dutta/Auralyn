import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';

import interactionCreate from '../src/events/interactionCreate.js';
import { createInteraction } from './helpers/discord-interaction.js';

const MUTATORS = ['skip', 'previous', 'loop', 'pause', 'volume', 'resume', 'playnext', 'bump', 'shuffle', '247'];

function commandInteraction(commandName) {
  const interaction = createInteraction({ guildId: 'guild-1', channelId: 'text-1', userId: 'plain-user' });
  interaction.commandName = commandName;
  interaction.isChatInputCommand = () => true;
  interaction.isButton = () => false;
  interaction.member = {
    roles: { cache: new Map() },
    voice: { channel: { id: 'voice-1', members: new Collection() } },
  };
  interaction.memberPermissions = { has: () => false };
  interaction.options = {
    getString: () => null,
    getInteger: () => 1,
    getBoolean: () => null,
  };
  return interaction;
}

const currentFixture = {
  encoded: 'encoded-one',
  info: { title: 'Track one', author: 'Artist', length: 1000, uri: 'https://example.com/one', artworkUrl: null },
};

function djOnlyClient(commandName) {
  const calls = [];
  return {
    calls,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    commands: new Map(),
    config: { djRoleIds: ['dj-role'], djModeEnabled: true, controlMode: 'public' },
    rest: { async patch() { return {}; } },
    musicPlayer: {
      settingsStore: {
        async get() {
          return {
            controlMode: 'public',
            djModeEnabled: true,
            djRoleIds: ['dj-role'],
            commandRestrictions: { [commandName]: { djOnly: true } },
          };
        },
      },
      getPlayerState: () => ({ isPlaying: true, isPaused: false, loopMode: 0, currentTrack: currentFixture, volume: 100, queue: [] }),
      async skip() { calls.push(['skip']); },
      async previous() { calls.push(['previous']); },
      async pause() { calls.push(['pause']); },
      async resume() { calls.push(['resume']); },
      setLoopMode() { calls.push(['loop']); },
      async setVolume() { calls.push(['volume']); },
      getPosition: () => 0,
      getVolume: () => 100,
      getLoopMode: () => 0,
      getFilters: () => ({}),
      queueManager: { getState: () => ({ queue: [] }) },
    },
  };
}

// Responses mix Components V2 containers with plain v1 embeds, so flatten both.
function replyText(interaction) {
  const payload = interaction.state.replyPayload ?? {};
  const fromComponents = (payload.components ?? [])
    .flatMap(c => (c.components ?? []).map(part => part.content ?? ''));
  const fromEmbeds = (payload.embeds ?? [])
    .map(embed => [embed.title, embed.description].filter(Boolean).join(' '));
  return [...fromComponents, ...fromEmbeds].join('\n');
}

test('a dj_only restriction blocks a non-DJ on every playback-mutating command', async t => {
  for (const name of MUTATORS) {
    await t.test(name, async () => {
      const client = djOnlyClient(name);
      const interaction = commandInteraction(name);

      client.commands.set(name, { data: { name }, async execute() { client.calls.push([name]); } });
      await interactionCreate.execute(interaction, client, null);

      assert.equal(
        client.calls.length,
        0,
        `/${name} executed for a non-DJ despite a dj_only restriction`,
      );
      const reply = replyText(interaction).toLowerCase();
      assert.ok(
        reply.includes('permission') || reply.includes('not allowed') || reply.includes('dj'),
        `/${name} gave no permission-denied response, got: ${reply}`,
      );
    });
  }
});

test('a dj_only restriction does not block a DJ-role member', async () => {
  const client = djOnlyClient('skip');
  const interaction = commandInteraction('skip');
  interaction.member = {
    roles: { cache: new Map([['dj-role', { id: 'dj-role' }]]) },
    voice: { channel: { id: 'voice-1', members: new Collection() } },
  };
  client.commands.set('skip', { data: { name: 'skip' }, async execute() { client.calls.push(['skip']); } });
  await interactionCreate.execute(interaction, client, null);

  assert.deepEqual(client.calls, [['skip']], 'a DJ-role member was blocked by a dj_only restriction');
});