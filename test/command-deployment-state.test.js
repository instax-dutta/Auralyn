import test from 'node:test';
import assert from 'node:assert/strict';
import { REST, Routes } from 'discord.js';
import { deployCommands, deployCommandsForGuild, resetDeploymentState } from '../src/utils/deploy-commands.js';

const config = {
  clientId: 'client-1',
  discordToken: 'test-token',
  logLevel: 'error',
};

function recordPuts() {
  const originalPut = REST.prototype.put;
  const requests = [];

  // Deployment state is process-local and long-lived by design, so each test
  // resets it to assert against a known-empty cache.
  resetDeploymentState();

  REST.prototype.put = async function (route, options) {
    requests.push({ route, body: options?.body });
    return [];
  };

  return {
    requests,
    restore: () => {
      REST.prototype.put = originalPut;
    },
  };
}

test('global command deployment must not suppress a different guild deployment', async () => {
  const { requests, restore } = recordPuts();

  try {
    const globalRoute = Routes.applicationCommands('client-1');
    const guildRoute = Routes.applicationGuildCommands('client-1', 'guild-2');

    await deployCommands(config);
    await deployCommandsForGuild(config, 'guild-2');

    assert.ok(
      requests.some(request => request.route === globalRoute),
      'global application command route was not recorded',
    );
    assert.ok(
      requests.some(request => request.route === guildRoute),
      'guild-2 application command route was missing',
    );
  } finally {
    restore();
  }
});

test('guild command deployment must not suppress a later global deployment', async () => {
  const { requests, restore } = recordPuts();

  try {
    const globalRoute = Routes.applicationCommands('client-1');
    const guildRoute = Routes.applicationGuildCommands('client-1', 'guild-3');

    await deployCommandsForGuild(config, 'guild-3');
    await deployCommands(config);

    assert.ok(
      requests.some(request => request.route === guildRoute),
      'guild-3 application command route was not recorded',
    );
    assert.ok(
      requests.some(request => request.route === globalRoute),
      'global application command route was missing',
    );
  } finally {
    restore();
  }
});

test('one guild deployment must not suppress a different guild deployment', async () => {
  const { requests, restore } = recordPuts();

  try {
    const firstGuildRoute = Routes.applicationGuildCommands('client-1', 'guild-4');
    const secondGuildRoute = Routes.applicationGuildCommands('client-1', 'guild-5');

    await deployCommandsForGuild(config, 'guild-4');
    await deployCommandsForGuild(config, 'guild-5');

    assert.ok(
      requests.some(request => request.route === firstGuildRoute),
      'guild-4 application command route was not recorded',
    );
    assert.ok(
      requests.some(request => request.route === secondGuildRoute),
      'guild-5 application command route was missing',
    );
  } finally {
    restore();
  }
});