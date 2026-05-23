import test from 'node:test';
import assert from 'node:assert/strict';

import { getCommandDeploymentTargets } from '../src/utils/deploy-commands.js';

test('deployment targets global commands when no guild ids are set', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: undefined,
  });

  assert.deepEqual(targets, [
    { scope: 'global', clientId: 'client' },
  ]);
});

test('deployment targets only guild scope when guild id is configured', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: 'guild',
  });

  assert.deepEqual(targets, [
    { scope: 'guild', clientId: 'client', guildId: 'guild' },
  ]);
});
