import test from 'node:test';
import assert from 'node:assert/strict';

import { getCommandDeploymentTargets } from '../src/utils/deploy-commands.js';

test('deployment targets global commands when no guild id is set', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: undefined,
  });

  assert.deepEqual(targets, [
    { scope: 'global', clientId: 'client' },
  ]);
});

test('deployment targets both global and guild commands when guild id is set', () => {
  const targets = getCommandDeploymentTargets({
    clientId: 'client',
    guildId: 'guild',
  });

  assert.deepEqual(targets, [
    { scope: 'global', clientId: 'client' },
    { scope: 'guild', clientId: 'client', guildId: 'guild' },
  ]);
});
