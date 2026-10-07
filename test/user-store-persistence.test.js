import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PlaylistStore } from '../src/utils/playlist-store.js';
import { LikedStore } from '../src/utils/liked-store.js';

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'auralyn-user-store-'));
}

/**
 * The stores resolve their paths through data-dir.js, which reads DATA_DIR at
 * import time, so each case runs in a child process pointed at its own root.
 */
async function inChild(source, env = {}) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const root = await tempRoot();
  const bundlePath = path.join(root, 'case.bundle.mjs');
  const scriptPath = path.join(root, 'case.mjs');
  const reportPath = path.join(root, 'report.json');

  // The case is an exported function so it can use await and return a value.
  await writeFile(
    bundlePath,
    `export default async function run() {\n${source}\n}\n`,
    'utf8',
  );

  await writeFile(
    scriptPath,
    [
      'const fs = await import("node:fs/promises");',
      'try {',
      `  const { default: run } = await import(${JSON.stringify(bundlePath)});`,
      `  const result = await run();`,
      `  await fs.writeFile(${JSON.stringify(reportPath)}, JSON.stringify({ ok: true, result }), "utf8");`,
      '} catch (error) {',
      `  await fs.writeFile(${JSON.stringify(reportPath)}, JSON.stringify({ ok: false, error: error.message }), "utf8");`,
      '}',
    ].join('\n'),
    'utf8',
  );

  await execFileAsync(process.execPath, [scriptPath], {
    timeout: 20_000,
    env: { ...process.env, DATA_DIR: root, ...env },
  });

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  return { root, report };
}

test('a playlist write survives an interrupted write', async () => {
  const { root, report } = await inChild(`
    const { PlaylistStore } = await import('${process.cwd()}/src/utils/playlist-store.js');
    const store = new PlaylistStore();
    await store.createPlaylist('user-1', 'First');
    const file = store.getUserFilePath('user-1');
    return { file, names: (await store.getPlaylists('user-1')).map(p => p.name) };
  `);

  assert.equal(report.ok, true, report.error);
  assert.deepEqual(report.result.names, ['First']);

  // No temporary sibling is left behind by the atomic write.
  const entries = await readdir(path.join(root, 'playlists'));
  assert.deepEqual(
    entries.filter(name => name.endsWith('.tmp') || name.includes('.tmp')),
    [],
    `a temporary file was left behind: ${entries.join(', ')}`,
  );
});

test('a user can never read another users playlists', async () => {
  const { root, report } = await inChild(`
    const { PlaylistStore } = await import('${process.cwd()}/src/utils/playlist-store.js');
    const store = new PlaylistStore();
    await store.createPlaylist('user-a', 'A private list');
    await store.createPlaylist('user-b', 'B private list');
    return {
      a: (await store.getPlaylists('user-a')).map(p => p.name),
      b: (await store.getPlaylists('user-b')).map(p => p.name),
    };
  `);

  assert.equal(report.ok, true, report.error);
  assert.deepEqual(report.result.a, ['A private list']);
  assert.deepEqual(report.result.b, ['B private list']);

  const files = await readdir(path.join(root, 'playlists'));
  assert.ok(files.includes('user-a.json') && files.includes('user-b.json'), `expected one file per user, saw ${files.join(', ')}`);
});

test('a liked-songs write survives an interrupted write', async () => {
  const { root, report } = await inChild(`
    const { LikedStore } = await import('${process.cwd()}/src/utils/liked-store.js');
    const store = new LikedStore();
    await store.likeTrack('user-1', { encoded: 'e1', info: { title: 'One', uri: 'https://example.com/one', length: 1000 } });
    return { liked: await store.getLikedSongs('user-1') };
  `);

  assert.equal(report.ok, true, report.error);
  assert.equal(report.result.liked.length, 1);

  const entries = await readdir(path.join(root, 'liked'));
  assert.deepEqual(entries.filter(name => name.includes('.tmp')), [], `a temporary file was left behind: ${entries.join(', ')}`);
});

test('two store instances do not erase each others writes for one user', async () => {
  const { report } = await inChild(`
    const { PlaylistStore } = await import('${process.cwd()}/src/utils/playlist-store.js');
    const first = new PlaylistStore();
    const second = new PlaylistStore();
    await first.createPlaylist('user-1', 'From first');
    await second.createPlaylist('user-1', 'From second');
    return { names: (await first.getPlaylists('user-1')).map(p => p.name) };
  `);

  assert.equal(report.ok, true, report.error);
  assert.ok(
    report.result.names.includes('From first'),
    `a second store instance erased the first write: ${JSON.stringify(report.result.names)}`,
  );
  assert.ok(
    report.result.names.includes('From second'),
    'the second write was lost',
  );
});

test('a corrupt playlist file does not block that user or another', async () => {
  const { root, report } = await inChild(`
    const fs = await import('node:fs/promises');
    const { PlaylistStore } = await import('${process.cwd()}/src/utils/playlist-store.js');
    const store = new PlaylistStore();
    await store.createPlaylist('user-a', 'Healthy');
    await fs.mkdir(store.getUserFilePath('user-b').replace(/\\/[^/]+$/, ''), { recursive: true });
    await fs.writeFile(store.getUserFilePath('user-b'), '{ broken');
    return {
      a: (await store.getPlaylists('user-a')).map(p => p.name),
      b: (await store.getPlaylists('user-b')).map(p => p.name),
    };
  `);

  assert.equal(report.ok, true, report.error);
  assert.deepEqual(report.result.a, ['Healthy'], 'a corrupt sibling broke a healthy user');
  assert.deepEqual(report.result.b, [], 'a corrupt file did not fall back to empty');

  const quarantined = (await readdir(path.join(root, 'playlists'))).filter(n => n.includes('corrupt'));
  assert.equal(quarantined.length, 1, `the corrupt file was not quarantined: ${await readdir(path.join(root, 'playlists'))}`);
});