import test from 'node:test';
import assert from 'node:assert/strict';

import { getCommandDeploymentTargets } from '../src/utils/deploy-commands.js';

test('deployment targets global commands when no guild ids are set', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: undefined,
    guildIds: [],
  });

  assert.deepEqual(targets, [
    { scope: 'global', clientId: 'client' },
  ]);
});

test('deployment targets global commands, discovered guilds, and configured guild id without duplicates', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: 'guild',
    guildIds: ['guild', 'guild-two'],
  });

  assert.deepEqual(targets, [
    { scope: 'global', clientId: 'client' },
    { scope: 'guild', clientId: 'client', guildId: 'guild' },
    { scope: 'guild', clientId: 'client', guildId: 'guild-two' },
  ]);
});
