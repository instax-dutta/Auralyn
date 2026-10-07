import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpotifyYtCache } from '../src/utils/spotify-yt-cache.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-cache-'));
}

function createCache(filePath, overrides = {}) {
  return new SpotifyYtCache({
    filePath,
    persistDebounceMs: 5,
    ...overrides,
  });
}

test('a corrupt cache is quarantined and the cache starts empty', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  await writeFile(file, '{ broken json');

  const cache = createCache(file);
  await cache.load();

  assert.equal(cache.size(), 0, 'a corrupt cache did not fall back to empty');

  const quarantined = (await readdir(dir)).filter(name => name.includes('corrupt'));
  assert.equal(quarantined.length, 1, `the corrupt cache was not quarantined: ${await readdir(dir)}`);
});

test('a corrupt cache does not throw', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');
  await writeFile(file, 'not json at all');

  const cache = createCache(file);

  await cache.load();
  await cache.flush();
});

test('a valid cache round-trips', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const first = createCache(file);
  await first.load();
  first.set('key-a', { id: 'a' });
  await first.flush();

  const second = createCache(file);
  await second.load();

  assert.deepEqual(second.get('key-a'), { id: 'a' });
});

test('a missing cache file is not an error', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const cache = createCache(file);
  await cache.load();

  assert.equal(cache.size(), 0);
  assert.deepEqual(await readdir(dir), []);
});

test('no temporary file is left behind after a flush', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const cache = createCache(file);
  await cache.load();
  cache.set('k', { v: 1 });
  await cache.flush();

  const entries = await readdir(dir);
  assert.deepEqual(
    entries.filter(name => name !== 'cache.json'),
    [],
    `temporary files were left behind: ${entries.join(', ')}`,
  );
});

test('two cache instances on one file both keep their keys', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const first = createCache(file);
  const second = createCache(file);

  await first.load();
  await second.load();

  first.set('from-first', { id: 1 });
  await first.flush();

  second.set('from-second', { id: 2 });
  await second.flush();

  const onDisk = JSON.parse(await readFile(file, 'utf8'));

  assert.ok('from-first' in onDisk, 'the first instance key was erased by the second write');
  assert.ok('from-second' in onDisk, 'the second instance key is missing');
});

test('a second instance sees keys written by the first', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const first = createCache(file);
  const second = createCache(file);

  await first.load();
  first.set('shared', { id: 'shared' });
  await first.flush();

  await second.load();
  assert.deepEqual(second.get('shared'), { id: 'shared' }, 'the second instance did not see the first write');
});

test('expired entries are not persisted', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const cache = createCache(file, { ttlMs: 1 });
  await cache.load();
  cache.set('short', { id: 'x' });

  await new Promise(resolve => setTimeout(resolve, 20));
  await cache.flush();

  const onDisk = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(!('short' in onDisk), 'an expired entry was persisted');
});

test('flush cancels the debounce timer instead of writing twice', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const cache = createCache(file, { persistDebounceMs: 10_000 });
  await cache.load();
  cache.set('k', { id: 1 });

  assert.ok(cache.persistTimer, 'no debounce timer was scheduled');

  await cache.flush();
  assert.equal(cache.persistTimer, null, 'flush left the debounce timer armed');
});

test('the debounce timer is owned and released by dispose', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'cache.json');

  const cache = createCache(file, { persistDebounceMs: 10_000 });
  await cache.load();
  cache.set('k', { id: 1 });

  assert.equal(cache.timers.size, 1, 'the debounce timer was not registered');

  const released = cache.dispose();

  assert.equal(released, 1, 'dispose did not release the debounce timer');
  assert.equal(cache.timers.size, 0);

  // A disposed cache must not arm another write.
  cache.set('later', { id: 2 });
  assert.equal(cache.timers.size, 0, 'a disposed cache armed a new timer');
});