import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeJsonAtomic, readJsonWithQuarantine } from '../src/utils/atomic-json.js';
import { JsonSessionStore } from '../src/utils/session-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-atomic-'));
}

test('a failed write leaves the previous file intact and readable', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeJsonAtomic(file, { generation: 1 });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { generation: 1 });

  // A payload that cannot be serialised must not damage what is already on disk.
  const cyclic = {};
  cyclic.self = cyclic;
  await assert.rejects(() => writeJsonAtomic(file, cyclic));

  assert.deepEqual(
    JSON.parse(await readFile(file, 'utf8')),
    { generation: 1 },
    'a failed write corrupted the existing file',
  );
});

test('a successful write replaces the file and is readable back', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeJsonAtomic(file, { generation: 1 });
  await writeJsonAtomic(file, { generation: 2 });

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { generation: 2 });
});

test('no temporary files are left behind', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeJsonAtomic(file, { generation: 1 });
  await writeJsonAtomic(file, { generation: 2 });

  const entries = await readdir(dir);
  assert.deepEqual(
    entries.filter(name => name !== 'state.json'),
    [],
    `temporary files were left behind: ${entries.join(', ')}`,
  );
});

test('a reader never observes a partially written file', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeJsonAtomic(file, { generation: 0 });

  // A payload far larger than one write syscall: with a plain in-place write a
  // concurrent reader can catch the file mid-update and fail to parse it.
  const big = { generation: 1, blob: 'x'.repeat(3_000_000) };

  const write = writeJsonAtomic(file, big);
  let observed = null;
  let parseFailed = false;

  while (observed === null) {
    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.generation === 1) observed = parsed;
    } catch {
      parseFailed = true;
      break;
    }
  }

  await write;
  assert.equal(parseFailed, false, 'a concurrent reader observed a partially written file');
  assert.equal(observed.blob.length, big.blob.length);
});

test('the directory is created when missing', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'nested', 'deeper', 'state.json');

  await writeJsonAtomic(file, { ok: true });

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { ok: true });
});

test('a pre-existing file is replaced rather than merged', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeFile(file, 'not json at all');
  await writeJsonAtomic(file, { recovered: true });

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { recovered: true });
});
test('an unparseable file is quarantined instead of thrown', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeFile(file, '{ this is not json');

  const result = await readJsonWithQuarantine(file);

  assert.equal(result.value, null);
  assert.ok(result.quarantinedTo, 'no quarantine path was reported');

  const quarantined = await readFile(result.quarantinedTo, 'utf8');
  assert.equal(quarantined, '{ this is not json', 'the corrupt content was not preserved');
});

test('a missing file reports missing rather than quarantining', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'absent.json');

  const result = await readJsonWithQuarantine(file);

  assert.equal(result.value, null);
  assert.equal(result.missing, true);
  assert.equal(result.quarantinedTo, undefined);
});

test('a valid file is returned untouched', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await writeJsonAtomic(file, { generation: 7 });

  const result = await readJsonWithQuarantine(file);

  assert.deepEqual(result.value, { generation: 7 });
  assert.equal(result.quarantinedTo, undefined);
});

test('a store starts empty when its file is corrupt', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  await writeFile(file, '{ corrupt');

  const store = new JsonSessionStore({ filePath: file });
  const cache = await store.ensureLoaded();

  assert.deepEqual(cache, {}, 'a corrupt session file blocked startup');
});

test('a store keeps the corrupt file for inspection', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'sessions.json');

  await writeFile(file, '{ corrupt');

  const store = new JsonSessionStore({ filePath: file });
  await store.ensureLoaded();

  const entries = await readdir(dir);
  const quarantined = entries.filter(name => name.startsWith('sessions.json.corrupt-'));
  assert.equal(quarantined.length, 1, `expected one quarantined file, saw ${entries.join(', ')}`);
});
