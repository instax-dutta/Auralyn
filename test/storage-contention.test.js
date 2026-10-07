import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-contention-'));
}

const snapshot = guildId => ({ guildId, queue: [{ encoded: `encoded-${guildId}` }], updatedAt: '2026-01-01T00:00:00.000Z' });

test('a second store instance does not erase the first instance write', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const first = new JsonSessionStore({ filePath: file });
  const second = new JsonSessionStore({ filePath: file });

  await first.ensureLoaded();
  await second.ensureLoaded();

  await first.save('guild-a', snapshot('guild-a'));
  await second.save('guild-b', snapshot('guild-b'));

  const onDisk = JSON.parse(await readFile(file, 'utf8')).sessions ?? {};

  assert.deepEqual(
    Object.keys(onDisk).sort(),
    ['guild-a', 'guild-b'],
    'the second writer erased the first writer entry',
  );
});

test('two store instances on a pre-existing file both keep their writes', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  await writeFile(file, JSON.stringify({ 'guild-existing': snapshot('guild-existing') }));

  const first = new JsonSessionStore({ filePath: file });
  const second = new JsonSessionStore({ filePath: file });

  await first.save('guild-a', snapshot('guild-a'));
  await second.save('guild-b', snapshot('guild-b'));

  const onDisk = JSON.parse(await readFile(file, 'utf8')).sessions ?? {};

  assert.deepEqual(
    Object.keys(onDisk).sort(),
    ['guild-a', 'guild-b', 'guild-existing'],
    'a store instance overwrote entries it had never seen',
  );
});

test('an overwriting write for one guild preserves the other guild', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const writer = new JsonSessionStore({ filePath: file });
  await writer.save('guild-a', snapshot('guild-a'));
  await writer.save('guild-b', snapshot('guild-b'));
  await writer.save('guild-a', { ...snapshot('guild-a'), volume: 42 });

  const onDisk = JSON.parse(await readFile(file, 'utf8')).sessions ?? {};

  assert.equal(onDisk['guild-a'].volume, 42);
  assert.ok(onDisk['guild-b'], 'the unrelated guild was lost by an update');
});

test('concurrent saves from one instance all survive', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const store = new JsonSessionStore({ filePath: file });

  await Promise.all(
    ['g1', 'g2', 'g3', 'g4'].map(guildId => store.save(guildId, snapshot(guildId))),
  );

  const onDisk = JSON.parse(await readFile(file, 'utf8')).sessions ?? {};
  assert.deepEqual(Object.keys(onDisk).sort(), ['g1', 'g2', 'g3', 'g4']);
});

test('getAll reflects writes made by another instance', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const first = new JsonSessionStore({ filePath: file });
  const second = new JsonSessionStore({ filePath: file });

  await first.save('guild-a', snapshot('guild-a'));
  await second.save('guild-b', snapshot('guild-b'));

  assert.deepEqual(
    Object.keys(await second.getAll()).sort(),
    ['guild-a', 'guild-b'],
    'getAll reported a stale view',
  );
});
test('concurrent writes from separate processes all survive', async () => {
  const { fork } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');

  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');
  const helper = fileURLToPath(new URL('./helpers/storage-child.js', import.meta.url));

  const run = guildId => new Promise((resolve, reject) => {
    const child = fork(helper, [file, guildId], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(out) : reject(new Error(`${guildId} exited ${code}`))));
  });

  await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5'].map(run));

  const onDisk = JSON.parse(await readFile(file, 'utf8')).sessions ?? {};
  assert.deepEqual(
    Object.keys(onDisk).sort(),
    ['p1', 'p2', 'p3', 'p4', 'p5'],
    'concurrent process writes lost entries',
  );
});

test('no lock file is left behind after writes', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  const store = new JsonSessionStore({ filePath: file });
  await store.save('guild-a', snapshot('guild-a'));
  await store.save('guild-b', snapshot('guild-b'));

  const entries = await readdir(dir);
  assert.deepEqual(
    entries.filter(name => name.endsWith('.lock')),
    [],
    'a lock file was left behind',
  );
});
