import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-session-'));
}

const session = (guildId, updatedAt, extra = {}) => ({
  guildId,
  queue: [{ encoded: 'encoded-1' }],
  currentTrack: { encoded: 'encoded-current' },
  updatedAt,
  ...extra,
});

test('a saved session reports a revision that increases on each write', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:00.000Z'));
  const first = await store.get('guild-a');

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z'));
  const second = await store.get('guild-a');

  assert.ok(typeof first.revision === 'number', 'the envelope carries no revision');
  assert.ok(
    second.revision > first.revision,
    `revision did not increase: ${first.revision} -> ${second.revision}`,
  );
});

test('a write older than what is stored is rejected', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:05.000Z'));

  await assert.rejects(
    () => store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z')),
    (error) => {
      assert.equal(error.name, 'StaleRevisionError');
      assert.equal(error.guildId, 'guild-a');
      return true;
    },
    'a stale write silently overwrote a newer session',
  );

  const stored = JSON.parse(await readFile(path.join(dir, 'sessions.json'), 'utf8')).sessions;
  assert.equal(
    stored['guild-a'].updatedAt,
    '2026-01-01T00:00:05.000Z',
    'the rejected write still reached disk',
  );
});

test('a rejected write leaves every other field intact', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:05.000Z', { volume: 42 }));

  await assert.rejects(
    () => store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z', { volume: 1 })),
    /stale/i,
  );

  const stored = JSON.parse(await readFile(path.join(dir, 'sessions.json'), 'utf8')).sessions;
  assert.equal(stored['guild-a'].volume, 42);
});

test('a newer write is accepted', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z', { volume: 10 }));
  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:02.000Z', { volume: 20 }));

  assert.equal((await store.get('guild-a')).volume, 20);
});

test('a write with the same timestamp is accepted', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z', { volume: 10 }));
  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z', { volume: 20 }));

  assert.equal((await store.get('guild-a')).volume, 20, 'a same-instant write was rejected as stale');
});

test('a session saved without an updatedAt is accepted', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:01.000Z'));
  const noStamp = { guildId: 'guild-a', queue: [] };

  await store.save('guild-a', noStamp);
  assert.deepEqual((await store.get('guild-a')).queue, []);
});

test('staleness is judged per guild', async () => {
  const dir = await tempDir();
  const store = new JsonSessionStore({ filePath: path.join(dir, 'sessions.json') });

  await store.save('guild-a', session('guild-a', '2026-01-01T00:00:05.000Z'));
  await store.save('guild-b', session('guild-b', '2026-01-01T00:00:01.000Z'));

  await store.save('guild-b', session('guild-b', '2026-01-01T00:00:09.000Z'));

  assert.equal(
    (await store.get('guild-a')).updatedAt,
    '2026-01-01T00:00:05.000Z',
    'one guild rejected a valid write because another guild was newer',
  );
});