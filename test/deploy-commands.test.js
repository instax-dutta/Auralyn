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

test('deployment targets only guild scope when guild ids are configured', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: 'guild',
    guildIds: ['guild', 'guild-two'],
  });

  assert.deepEqual(targets, [
    { scope: 'guild', clientId: 'client', guildId: 'guild' },
    { scope: 'guild', clientId: 'client', guildId: 'guild-two' },
  ]);
});
