import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GuildSettingsStore, guildSettingsPath } from '../src/utils/guild-settings.js';
import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-legacy-e2e-'));
}

/**
 * Reproduces the on-disk state a pre-Phase-3 deployment left behind: one
 * guild-settings.json map for every guild, and one sessions.json map.
 */
async function writeLegacyDeployment(root) {
  await writeFile(path.join(root, 'guild-settings.json'), JSON.stringify({
    'guild-loud': { defaultVolume: 95, djModeEnabled: true, djRoleIds: ['dj-loud'] },
    'guild-quiet': { defaultVolume: 20 },
    'guild-defaults': {},
  }), 'utf8');

  await writeFile(path.join(root, 'sessions.json'), JSON.stringify({
    'guild-loud': {
      guildId: 'guild-loud',
      queue: [{ encoded: 'encoded-1', info: { title: 'One' } }],
      currentTrack: { encoded: 'encoded-0', info: { title: 'Zero' } },
      volume: 95,
      loopMode: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  }), 'utf8');
}

test('a legacy deployment is fully readable after migration', async () => {
  const root = await tempDir();
  await writeLegacyDeployment(root);

  const settingsStore = new GuildSettingsStore({ dataRoot: root });
  const sessionStore = new JsonSessionStore({ filePath: path.join(root, 'sessions.json') });

  await settingsStore.migrateLegacySettings();
  await sessionStore.migrateLegacySessions();

  assert.equal((await settingsStore.get('guild-loud')).defaultVolume, 95);
  assert.deepEqual((await settingsStore.get('guild-loud')).djRoleIds, ['dj-loud']);
  assert.equal((await settingsStore.get('guild-loud')).djModeEnabled, true);
  assert.equal((await settingsStore.get('guild-quiet')).defaultVolume, 20);

  // A guild present only as an empty legacy entry still resolves to defaults.
  assert.equal((await settingsStore.get('guild-defaults')).defaultVolume, 80);
  assert.equal((await settingsStore.get('guild-never-seen')).defaultVolume, 80);

  const session = await sessionStore.get('guild-loud');
  assert.equal(session.currentTrack.info.title, 'Zero');
  assert.equal(session.queue.length, 1);
  assert.equal(session.volume, 95);
  assert.equal(session.loopMode, 1);
  assert.ok(session.revision >= 1);
});

test('each legacy guild lands in its own file', async () => {
  const root = await tempDir();
  await writeLegacyDeployment(root);

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.migrateLegacySettings();

  for (const guildId of ['guild-loud', 'guild-quiet', 'guild-defaults']) {
    const onDisk = JSON.parse(await readFile(guildSettingsPath(guildId, { dataRoot: root }), 'utf8'));
    assert.equal(typeof onDisk, 'object');
    assert.ok(!('guild-loud' in onDisk && guildId !== 'guild-loud'), 'a guild map leaked into a per-guild file');
  }
});

test('migrated sessions survive a second store instance', async () => {
  const root = await tempDir();
  await writeLegacyDeployment(root);

  const file = path.join(root, 'sessions.json');
  await new JsonSessionStore({ filePath: file }).migrateLegacySessions();

  const reopened = new JsonSessionStore({ filePath: file });
  assert.equal((await reopened.get('guild-loud')).currentTrack.info.title, 'Zero');
});