import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GuildSettingsStore, defaultGuildSettings } from '../src/utils/guild-settings.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-guilds-'));
}

const settingsPath = (root, guildId) => path.join(root, 'guilds', guildId, 'settings.json');

test('each guild is persisted to its own file', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  await store.update('guild-a', { defaultVolume: 65 });
  await store.update('guild-b', { defaultVolume: 33 });

  assert.ok(await readFile(settingsPath(dataRoot, 'guild-a'), 'utf8'), 'guild-a file missing');
  assert.ok(await readFile(settingsPath(dataRoot, 'guild-b'), 'utf8'), 'guild-b file missing');

  const a = JSON.parse(await readFile(settingsPath(dataRoot, 'guild-a'), 'utf8'));
  const b = JSON.parse(await readFile(settingsPath(dataRoot, 'guild-b'), 'utf8'));

  assert.equal(a.defaultVolume, 65);
  assert.equal(b.defaultVolume, 33);
});

test('a guild file holds only that guild settings', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  await store.update('guild-a', { defaultVolume: 65, djRoleIds: ['dj-a'] });
  await store.update('guild-b', { defaultVolume: 33, djRoleIds: ['dj-b'] });

  const a = JSON.parse(await readFile(settingsPath(dataRoot, 'guild-a'), 'utf8'));

  assert.equal(a.defaultVolume, 65);
  assert.equal(a.guildId, undefined, 'the guild file should not be a map of guilds');
  assert.ok(!('guild-b' in a), 'another guild leaked into this guild file');
});

test('guilds directory contains one entry per guild', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  await store.update('guild-a', { defaultVolume: 65 });
  await store.update('guild-b', { defaultVolume: 33 });

  const guilds = await readdir(path.join(dataRoot, 'guilds'));
  assert.deepEqual(guilds.sort(), ['guild-a', 'guild-b']);
});

test('settings survive a restart', async () => {
  const dataRoot = await tempDir();

  const first = new GuildSettingsStore({ dataRoot });
  await first.update('guild-a', { defaultVolume: 65, djRoleIds: ['dj'] });

  const second = new GuildSettingsStore({ dataRoot });
  assert.equal((await second.get('guild-a')).defaultVolume, 65);
  assert.deepEqual((await second.get('guild-a')).djRoleIds, ['dj']);
});

test('an unknown guild still gets the full defaults', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  assert.deepEqual(await store.get('guild-unknown'), defaultGuildSettings);
});

test('a guild update does not disturb another guild', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  await store.update('guild-a', { defaultVolume: 65 });
  await store.update('guild-b', { defaultVolume: 33 });
  await store.update('guild-a', { autoplay: true });

  const a = JSON.parse(await readFile(settingsPath(dataRoot, 'guild-a'), 'utf8'));
  const b = JSON.parse(await readFile(settingsPath(dataRoot, 'guild-b'), 'utf8'));

  assert.equal(a.defaultVolume, 65);
  assert.equal(a.autoplay, true);
  assert.equal(b.defaultVolume, 33);
  assert.equal(b.autoplay, false, 'updating one guild changed another');
});

test('getAll reports every persisted guild', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });

  await store.update('guild-a', { defaultVolume: 65 });
  await store.update('guild-b', { defaultVolume: 33 });

  const all = await store.getAll();
  assert.deepEqual(Object.keys(all).sort(), ['guild-a', 'guild-b']);
  assert.equal(all['guild-a'].defaultVolume, 65);
});

test('a corrupt guild file is quarantined and that guild falls back to defaults', async () => {
  const dataRoot = await tempDir();
  const store = new GuildSettingsStore({ dataRoot });
  await store.update('guild-a', { defaultVolume: 65 });

  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(settingsPath(dataRoot, 'guild-b').replace(/\/settings\.json$/, ''), { recursive: true });
  await writeFile(settingsPath(dataRoot, 'guild-b'), '{ broken');

  assert.deepEqual(await store.get('guild-b'), defaultGuildSettings, 'a corrupt guild file blocked reads');
  assert.equal((await store.get('guild-a')).defaultVolume, 65, 'a corrupt sibling broke a healthy guild');
});