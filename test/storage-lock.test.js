import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { withFileLock } from '../src/utils/storage-lock.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-lock-'));
}

test('the lock is released after the task succeeds', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await withFileLock(file, async () => 'done');

  assert.deepEqual((await readdir(dir)).filter(n => n.endsWith('.lock')), []);
});

test('the lock is released even when the task throws', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  await assert.rejects(() => withFileLock(file, async () => {
    throw new Error('boom');
  }), /boom/);

  assert.deepEqual(
    (await readdir(dir)).filter(n => n.endsWith('.lock')),
    [],
    'a failed task leaked its lock',
  );
});

test('a lock held by a dead process is reclaimed', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  // A PID that cannot be running, so the owner is verifiably gone.
  await writeFile(`${file}.lock`, '999999999-deadbeef 999999999', 'utf8');

  const result = await withFileLock(file, async () => 'reclaimed');

  assert.equal(result, 'reclaimed');
  assert.deepEqual((await readdir(dir)).filter(n => n.endsWith('.lock')), []);
});

test('a lock actively held by a live holder is not stolen', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  let release;
  const held = new Promise(resolve => { release = resolve; });
  let secondEntered = false;

  const holder = withFileLock(file, async () => {
    await held;
    return 'first';
  }, { staleMs: 100 });

  // Wait past staleMs: the holder is alive and heartbeating, so a second caller
  // must wait rather than reclaim.
  await new Promise(resolve => setTimeout(resolve, 350));

  const contender = withFileLock(file, async () => {
    secondEntered = true;
    return 'second';
  }, { staleMs: 100 });

  release();
  assert.equal(await holder, 'first');
  await contender;

  assert.equal(secondEntered, true);
  assert.deepEqual((await readdir(dir)).filter(n => n.endsWith('.lock')), []);
});

test('an abandoned lock ages out even when its pid looks alive', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');

  // Nothing refreshes this lock, so it is abandoned even though the pid is live.
  await writeFile(`${file}.lock`, `abandoned ${process.pid}`, 'utf8');

  assert.equal(await withFileLock(file, async () => 'reclaimed', { staleMs: 100 }), 'reclaimed');
  assert.deepEqual((await readdir(dir)).filter(n => n.endsWith('.lock')), []);
});

test('the lock is serialised for concurrent callers on one path', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'state.json');
  const order = [];

  await Promise.all(
    [1, 2, 3, 4].map(n => withFileLock(file, async () => {
      order.push(`enter-${n}`);
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push(`exit-${n}`);
    })),
  );

  for (let i = 0; i < order.length; i += 2) {
    assert.equal(order[i].replace('enter-', ''), order[i + 1].replace('exit-', ''));
  }
});

test('different paths do not block each other', async () => {
  const dir = await tempDir();

  const started = Date.now();
  await Promise.all([
    withFileLock(path.join(dir, 'a.json'), () => new Promise(r => setTimeout(r, 40))),
    withFileLock(path.join(dir, 'b.json'), () => new Promise(r => setTimeout(r, 40))),
  ]);

  assert.ok(Date.now() - started < 200, 'locks on different paths serialised against each other');
});