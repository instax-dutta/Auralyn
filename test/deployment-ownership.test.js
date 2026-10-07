import test from 'node:test';
import assert from 'node:assert/strict';
import { REST, Routes } from 'discord.js';

import { getCommandDeploymentTargets, resetDeploymentState } from '../src/utils/deploy-commands.js';

const config = {
  clientId: 'client-1',
  discordToken: 'test-token',
  logLevel: 'error',
};

function recordPuts() {
  const originalPut = REST.prototype.put;
  const requests = [];

  resetDeploymentState();

  REST.prototype.put = async function (route, options) {
    requests.push({ route, body: options?.body });
    return [];
  };

  return {
    requests,
    restore: () => { REST.prototype.put = originalPut; },
  };
}

const isGlobal = route => route === Routes.applicationCommands('client-1');
const isGuild = route => route.startsWith(`/applications/client-1/guilds/`);


test('a managed child resolves no global target', () => {
  const targets = getCommandDeploymentTargets(config, { isManagedChild: true });

  assert.deepEqual(
    targets.filter(target => target.scope === 'global'),
    [],
    'a managed child was given a global deployment target',
  );
});

test('a managed child with no GUILD_ID still gets no global target', () => {
  const targets = getCommandDeploymentTargets(config, { isManagedChild: true });

  assert.ok(
    targets.length === 0 || targets.every(target => target.scope === 'guild'),
    `expected only guild targets for a managed child, got ${JSON.stringify(targets)}`,
  );
});

test('GUILD_ID does not make a managed child the owner of global scope', () => {
  const withGuild = getCommandDeploymentTargets(
    { ...config, guildId: '111' },
    { isManagedChild: true },
  );

  assert.deepEqual(
    withGuild.map(target => target.scope),
    ['guild'],
    `GUILD_ID changed ownership for a managed child: ${JSON.stringify(withGuild)}`,
  );
  assert.equal(withGuild[0].guildId, '111');
});

test('the manager keeps the global target', () => {
  const targets = getCommandDeploymentTargets(config, {});

  assert.deepEqual(targets, [{ scope: 'global', clientId: 'client-1' }]);
});

test('a standalone process with GUILD_ID stays guild-only', () => {
  const targets = getCommandDeploymentTargets({ ...config, guildId: '222' }, {});

  assert.deepEqual(targets, [{ scope: 'guild', clientId: 'client-1', guildId: '222' }]);
});

test('a standalone process with GUILD_ID keeps its guild-only contract', () => {
  const targets = getCommandDeploymentTargets({ ...config, guildId: '333' }, {});

  assert.deepEqual(
    targets,
    [{ scope: 'guild', clientId: 'client-1', guildId: '333' }],
    'the pre-existing standalone GUILD_ID contract changed',
  );
});

test('deploying from a managed child issues no global PUT', async () => {
  const { deployCommands } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommands(config, { isManagedChild: true });
  } finally {
    restore();
  }

  assert.deepEqual(
    requests.filter(request => isGlobal(request.route)),
    [],
    'a managed child issued a global command PUT',
  );
});

test('deploying from the manager issues exactly one global PUT', async () => {
  const { deployCommands } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommands(config, {});
  } finally {
    restore();
  }

  assert.equal(requests.filter(request => isGlobal(request.route)).length, 1);
});

test('a guild deploy targets only that guild', async () => {
  const { deployCommandsForGuild } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommandsForGuild(config, 'guild-9');
  } finally {
    restore();
  }

  assert.deepEqual(requests.map(request => request.route), [
    Routes.applicationGuildCommands('client-1', 'guild-9'),
  ]);
  assert.equal(requests.filter(request => isGuild(request.route)).length, 1);
});

test('a managed child resolving a guild target never touches global', async () => {
  const { deployCommands } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommands(
      { ...config, guildId: 'guild-7' },
      { isManagedChild: true },
    );
  } finally {
    restore();
  }

  assert.deepEqual(requests.filter(request => isGlobal(request.route)), []);
  assert.deepEqual(requests.map(request => request.route), [
    Routes.applicationGuildCommands('client-1', 'guild-7'),
  ]);
});

test('a standalone process with no GUILD_ID still deploys global exactly once', async () => {
  const { deployCommands } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommands(config, {});
  } finally {
    restore();
  }

  assert.equal(requests.filter(request => isGlobal(request.route)).length, 1,
    'the standalone process did not deploy global exactly once');
  assert.deepEqual(requests.filter(request => isGuild(request.route)), [],
    'a standalone process with no GUILD_ID deployed a guild scope it was not configured for');
});

test('a standalone process with a GUILD_ID still deploys only that guild', async () => {
  const { deployCommands } = await import('../src/utils/deploy-commands.js');
  const { requests, restore } = recordPuts();

  try {
    await deployCommands({ ...config, guildId: 'guild-stand' }, {});
  } finally {
    restore();
  }

  assert.deepEqual(requests.map(request => request.route), [
    Routes.applicationGuildCommands('client-1', 'guild-stand'),
  ]);
  assert.deepEqual(requests.filter(request => isGlobal(request.route)), [],
    'the standalone GUILD_ID contract regressed into a global deploy');
});