import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GuildSettingsStore } from '../src/utils/guild-settings.js';
import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-migrate-'));
}

const legacySettings = {
  'guild-a': { defaultVolume: 65, djRoleIds: ['dj-a'] },
  'guild-b': { defaultVolume: 33 },
};

test('a legacy settings map migrates into per-guild files', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'guild-settings.json'), JSON.stringify(legacySettings), 'utf8');

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.migrateLegacySettings();

  assert.equal((await store.get('guild-a')).defaultVolume, 65);
  assert.equal((await store.get('guild-b')).defaultVolume, 33);

  const onDisk = JSON.parse(await readFile(path.join(root, 'guilds', 'guild-a', 'settings.json'), 'utf8'));
  assert.equal(onDisk.defaultVolume, 65);
  assert.ok(!('guild-b' in onDisk), 'another guild leaked into the migrated file');
});

test('migration never deletes the legacy source', async () => {
  const root = await tempDir();
  const legacy = path.join(root, 'guild-settings.json');
  await writeFile(legacy, JSON.stringify(legacySettings), 'utf8');

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.migrateLegacySettings();

  assert.ok(existsSync(legacy), 'migration deleted the legacy source');
});

test('migration is idempotent', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'guild-settings.json'), JSON.stringify(legacySettings), 'utf8');

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.migrateLegacySettings();
  const first = await readFile(path.join(root, 'guilds', 'guild-a', 'settings.json'), 'utf8');

  await store.migrateLegacySettings();
  const second = await readFile(path.join(root, 'guilds', 'guild-a', 'settings.json'), 'utf8');

  assert.equal(first, second, 'a second migration changed the migrated file');
  assert.equal((await store.get('guild-a')).defaultVolume, 65);
});

test('an existing canonical value wins over the legacy source', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'guild-settings.json'), JSON.stringify(legacySettings), 'utf8');

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.update('guild-a', { defaultVolume: 11 });
  await store.migrateLegacySettings();

  assert.equal(
    (await store.get('guild-a')).defaultVolume,
    11,
    'migration overwrote a newer canonical value with the legacy one',
  );
});

test('a corrupt canonical file falls back to the legacy source and quarantines the corrupt file', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'guild-settings.json'), JSON.stringify(legacySettings), 'utf8');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.join(root, 'guilds', 'guild-b'), { recursive: true });
  await writeFile(path.join(root, 'guilds', 'guild-b', 'settings.json'), '{ broken', 'utf8');

  const store = new GuildSettingsStore({ dataRoot: root });
  await store.migrateLegacySettings();

  assert.equal(
    (await store.get('guild-b')).defaultVolume,
    33,
    'recoverable legacy data was discarded because the canonical file was corrupt',
  );

  const quarantined = (await readdir(path.join(root, 'guilds', 'guild-b'))).filter(n => n.includes('corrupt'));
  assert.equal(quarantined.length, 1, `the corrupt file was not quarantined: ${await readdir(path.join(root, 'guilds', 'guild-b'))}`);
});

test('migration is a no-op when there is no legacy file', async () => {
  const root = await tempDir();
  const store = new GuildSettingsStore({ dataRoot: root });

  const result = await store.migrateLegacySettings();

  assert.equal(result.migrated, 0);
  assert.deepEqual(Object.keys(await store.getAll()), []);
});

test('legacy sessions migrate into the envelope', async () => {
  const root = await tempDir();
  const legacy = path.join(root, 'sessions.json');
  await writeFile(legacy, JSON.stringify({
    'guild-a': { guildId: 'guild-a', queue: [{ encoded: 'x' }], updatedAt: '2026-01-01T00:00:00.000Z' },
  }), 'utf8');

  const store = new JsonSessionStore({ filePath: legacy });
  const result = await store.migrateLegacySessions();

  assert.equal(result.migrated, 1);
  const stored = await store.get('guild-a');
  assert.equal(stored.revision, 1, 'the migrated session has no revision');
  assert.deepEqual(stored.queue, [{ encoded: 'x' }]);
});

test('legacy session migration is idempotent and keeps the source', async () => {
  const root = await tempDir();
  const legacy = path.join(root, 'sessions.json');
  await writeFile(legacy, JSON.stringify({
    'guild-a': { guildId: 'guild-a', queue: [], updatedAt: '2026-01-01T00:00:00.000Z' },
  }), 'utf8');

  const store = new JsonSessionStore({ filePath: legacy });
  await store.migrateLegacySessions();
  await store.migrateLegacySessions();

  assert.ok(existsSync(legacy), 'migration deleted the legacy session source');
  assert.equal((await store.get('guild-a')).revision, 1, 'a second migration bumped the revision');
});
