import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { isMainModule } from '../src/utils/is-main-module.js';

const urlFor = p => pathToFileURL(p).href;

test('the entrypoint resolves as main', () => {
  const entry = '/app/src/shard.js';

  assert.equal(isMainModule(urlFor(entry), entry), true,
    'the container entrypoint must be recognised as main or the manager never spawns');
});

test('an imported module is not main', () => {
  assert.equal(isMainModule(urlFor('/app/src/shard.js'), '/app/src/index.js'), false,
    'a module imported while another file runs is not the entrypoint');
});

test('a missing argv resolves as not main', () => {
  assert.equal(isMainModule(urlFor('/app/src/shard.js'), undefined), false);
  assert.equal(isMainModule(urlFor('/app/src/shard.js'), ''), false);
  assert.equal(isMainModule(undefined, '/app/src/shard.js'), false);
});

test('a path containing a hash still resolves as main', () => {
  // The failure this guards: `new URL('file://' + p)` treats '#' as the start of a
  // fragment, so the comparison fails and the entrypoint silently never runs.
  const entry = '/srv/auralyn#2/src/shard.js';

  assert.equal(urlFor(entry), 'file:///srv/auralyn%232/src/shard.js');

  const naive = new URL(`file://${entry}`).href;
  assert.notEqual(naive, urlFor(entry),
    'this test no longer demonstrates the bug if string concatenation happens to agree');

  assert.equal(isMainModule(urlFor(entry), entry), true,
    'a repo path containing # must not stop the manager from starting');
});

test('a path containing a space still resolves as main', () => {
  const entry = '/srv/Auralyn Bot/src/shard.js';

  assert.equal(isMainModule(urlFor(entry), entry), true);
});

test('a path containing a percent still resolves as main', () => {
  const entry = '/srv/100%_auralyn/src/shard.js';

  assert.equal(isMainModule(urlFor(entry), entry), true);
});

test('a relative argv resolves against the cwd rather than failing', () => {
  // Node always hands an absolute process.argv[1], so this is defensive only:
  // pathToFileURL resolves a relative path against cwd, which matches when the
  // cwd is the directory the entrypoint lives in, and correctly does not when
  // it is not.
  const relative = 'src/shard.js';

  assert.equal(isMainModule(urlFor(path.resolve(relative)), relative), true,
    'an entrypoint invoked by relative path from its own directory was not recognised');

  assert.equal(isMainModule(urlFor('/app/src/shard.js'), relative), false,
    'a relative argv was matched against an unrelated absolute path');
});