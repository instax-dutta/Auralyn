import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dockerfile = await readFile(path.join(REPO, 'Dockerfile'), 'utf8');

function pinnedArg(name) {
  const match = dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, 'm'));
  assert.ok(match, `the Dockerfile no longer pins ${name}`);
  return match[1];
}

/**
 * Versions of youtube-plugin that can no longer resolve YouTube audio.
 *
 * 1.18.1 fails signature extraction against YouTube's current player script:
 *
 *   LocalSignatureCipherManager: Problematic YouTube player script detected
 *   (issue detected with script: must find sig function)
 *   YoutubeAudioTrack.process: AllClientsFailedException: All clients failed to
 *   load the item.  Client [MWEB] failed: Must find sig function from script
 *
 * Lavalink announces a newer version on boot, but nothing in the build reads
 * that announcement, so an outdated pin looks exactly like a healthy build. The
 * symptom is playback silently not working, which no other test covers because
 * Lavalink is a separate process the suite never starts.
 */
const KNOWN_BROKEN_YOUTUBE_PLUGIN = new Set(['1.18.1']);

function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

test('the pinned youtube-plugin is not a version known to fail playback', () => {
  const pinned = pinnedArg('YOUTUBE_PLUGIN_VERSION');

  assert.equal(
    KNOWN_BROKEN_YOUTUBE_PLUGIN.has(pinned),
    false,
    `youtube-plugin ${pinned} cannot resolve audio: Lavalink reports "must find sig function" `
    + 'and every track fails with AllClientsFailedException',
  );
});

test('the pinned youtube-plugin is at least the first known-good version', () => {
  const pinned = pinnedArg('YOUTUBE_PLUGIN_VERSION');
  const firstKnownGood = '1.18.2';

  assert.ok(
    compareVersions(pinned, firstKnownGood) >= 0,
    `youtube-plugin ${pinned} predates ${firstKnownGood}, which is the first version that `
    + 'resolved audio against the current YouTube player script',
  );
});

test('both Lavalink plugin versions are pinned, not floating', () => {
  for (const name of ['YOUTUBE_PLUGIN_VERSION', 'LAVASRC_PLUGIN_VERSION']) {
    const pinned = pinnedArg(name);
    assert.match(pinned, /^\d+\.\d+\.\d+$/,
      `${name} is pinned to "${pinned}", which is not an exact version; a floating pin makes `
      + 'the build unreproducible');
  }
});

test('the download command interpolates the pinned ARG, not a literal version', () => {
  // If a literal version were hardcoded in the URL while the ARG said something
  // else, the ARG would look like a pin but change nothing, and the build would
  // silently ship the old plugin. The ARG must be interpolated in the URL path
  // segment, the URL filename, and the --output filename: 3 occurrences.
  for (const name of ['YOUTUBE_PLUGIN_VERSION', 'LAVASRC_PLUGIN_VERSION']) {
    const occurrences = dockerfile.split('${' + name + '}').length - 1;
    assert.equal(occurrences, 3,
      `expected ${name} to be interpolated 3 times (URL path, URL filename, output filename), saw ${occurrences}`);

    const pinned = pinnedArg(name);
    assert.equal(dockerfile.includes(`-${pinned}.jar`), false,
      `a literal "${pinned}" appears in the Dockerfile, so the ARG is not the single source of truth`);
  }
});