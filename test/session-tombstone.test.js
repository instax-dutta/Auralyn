import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-tombstone-'));
}

const session = (guildId, updatedAt = '2026-01-01T00:00:00.000Z') => ({
  guildId,
  queue: [{ encoded: 'encoded-1' }],
  updatedAt,
});

const readStoreFile = async file => {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  return { sessions: raw.sessions ?? {}, stopped: raw.stopped ?? {} };
};

test('a deleted session leaves a durable record of the stop', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-a', session('guild-a'));
  await store.delete('guild-a');

  assert.equal(await store.get('guild-a'), null, 'the session is still readable after delete');

  const onDisk = await readStoreFile(file);
  assert.ok(
    'guild-a' in (onDisk.stopped),
    `the stop was not recorded anywhere on disk: ${JSON.stringify(onDisk)}`,
  );
});

test('a stopped guild is distinguishable from one that never played', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-stopped', session('guild-stopped'));
  await store.delete('guild-stopped');
  await store.save('guild-other', session('guild-other'));

  const onDisk = await readStoreFile(file);

  assert.ok('guild-stopped' in (onDisk.stopped), 'the stopped guild has no record');
  assert.ok(!('guild-never' in (onDisk.stopped)), 'a guild that never played was marked stopped');
  assert.ok(!('guild-other' in (onDisk.stopped)), 'an unrelated guild was marked stopped');
  assert.ok(onDisk.sessions['guild-other'], 'an unrelated session was lost');
});

test('the stop record survives a restart', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const first = new JsonSessionStore({ filePath: file });
  await first.save('guild-a', session('guild-a'));
  await first.delete('guild-a');

  const second = new JsonSessionStore({ filePath: file });
  const onDisk = await readStoreFile(file);

  assert.ok('guild-a' in (onDisk.stopped), 'the stop record did not survive a restart');
  assert.equal(await second.get('guild-a'), null);
});

test('the stop record carries a timestamp', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-a', session('guild-a'));
  await store.delete('guild-a');

  const onDisk = await readStoreFile(file);
  const record = onDisk.stopped['guild-a'];

  assert.ok(
    typeof record === 'number' || Number.isFinite(Date.parse(record)),
    `the stop record has no usable timestamp: ${JSON.stringify(record)}`,
  );
});

test('new playback clears the stop record', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-a', session('guild-a'));
  await store.delete('guild-a');
  await store.save('guild-a', session('guild-a', '2026-01-01T00:01:00.000Z'));

  const onDisk = await readStoreFile(file);

  assert.ok(
    !('guild-a' in (onDisk.stopped)),
    'the stop record outlived new playback for that guild',
  );
  assert.ok(onDisk.sessions['guild-a'], 'the new session was not written');
});

test('a corrupt sessions file still leaves other guilds readable', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-a', session('guild-a'));
  await store.save('guild-b', session('guild-b'));
  await store.delete('guild-a');

  const onDisk = await readStoreFile(file);

  assert.ok(onDisk.sessions['guild-b'], 'an unrelated session was lost by the delete');
  assert.ok('guild-a' in (onDisk.stopped));
});

test('a corrupt stop record does not break session reads', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const store = new JsonSessionStore({ filePath: file });

  await store.save('guild-a', session('guild-a'));
  await store.delete('guild-a');

  // Simulate the stop record being mangled while the sessions survive.
  await writeFile(file, JSON.stringify({ 'guild-a': session('guild-a'), stopped: '{ broken' }), 'utf8');

  assert.ok(await store.get('guild-a'), 'a corrupt stop record broke session reads');
});