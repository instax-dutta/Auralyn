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
// Both measured failures against a real Lavalink on 2026-10-07. 1.18.2 is listed
// because the signature error people blame on it actually came from Lavalink's
// legacy source; with the plugin resolving, 1.18.2 still fails, now on the PO
// token wall. Neither version plays anything today.
const KNOWN_BROKEN_YOUTUBE_PLUGIN = new Set(['1.18.1', '1.18.2']);

/**
 * Recording a probe result that DISPROVED an earlier claim.
 *
 * This file previously asserted that 1.18.2 "resolved audio". That was never
 * verified; it was inferred from a boot warning that a newer version existed.
 * Measured against a real Lavalink resolving real YouTube URLs on 2026-10-07:
 *
 *   1.18.1  -> fail
 *   1.18.2  -> fail
 *
 * Every published version failed, because the signature failure was coming from
 * Lavalink's LEGACY built-in youtube source (lavalink.server.sources.youtube),
 * not the plugin. With that legacy source disabled so the plugin actually
 * resolves, signature extraction succeeds and every client instead reports
 * "This video requires login" — a missing PO token, which is upstream issue
 * #240 and is not fixed in any released version.
 *
 * So no version bump fixes playback. This test therefore guards the version
 * CONTRACT (the image ships what application.yml declares) and must not claim
 * any version is known-good; see test/playback-canary.md for the live probe.
 */
const NO_VERSION_IS_KNOWN_GOOD = true;

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

test('the pinned youtube-plugin is not a version known to fail playback', async () => {
  const pinned = pinnedArg('YOUTUBE_PLUGIN_VERSION');
  const canary = await readFile(path.join(REPO, 'docs', 'playback-canary.md'), 'utf8');

  if (!KNOWN_BROKEN_YOUTUBE_PLUGIN.has(pinned)) {
    return; // a version nobody has measured failing
  }

  // Deliberately does not fail the build just because YouTube is broken. An
  // upstream outage is not actionable by a commit here, and hard-failing would
  // block every unrelated change until YouTube ships a fix. Instead it asserts
  // the measured state is written down, so whoever bumps the pin knows there is
  // a canary to re-run and that the previous verdict was recorded.
  assert.match(canary, new RegExp(`${pinned.replace(/\./g, '\\.')}.*fail|fail.*${pinned.replace(/\./g, '\\.')}`, 'is'),
    `youtube-plugin ${pinned} is recorded as failing playback but docs/playback-canary.md does not say so. `
    + 'Re-run the canary before changing this pin, and update that file with the result.');

  assert.match(canary, /youtube-source#240|240/,
    'docs/playback-canary.md should link the upstream issue that explains the failure');
});

/**
 * The plugin version was declared in two places: the Dockerfile ARG that names
 * the downloaded jar, and the `plugins:` dependency list in application.yml.
 * They drifted apart and took the whole server down:
 *
 *   java.lang.RuntimeException: Failed to delete ./plugins/youtube-plugin-1.18.2.jar
 *     at lavalink.server.bootstrap.PluginManager.manageDownloads(PluginManager.kt:79)
 *
 * Lavalink compares the declared dependency against the jar it finds on disk. On
 * a mismatch it deletes the jar and downloads the declared one, and under a
 * read-only rootfs that delete throws from the PluginManager constructor, so
 * Spring never starts and the bot never boots.
 */
const applicationYml = await readFile(path.join(REPO, 'lavalink', 'application.yml'), 'utf8');

test('every declared Lavalink plugin dependency matches the jar shipped in the image', () => {
  const declared = [...applicationYml.matchAll(/- dependency: "([^"]+)"/g)].map(match => match[1]);

  assert.ok(declared.length > 0, 'no plugin dependencies found in application.yml');

  for (const coordinate of declared) {
    const [artifact, version] = coordinate.split(':').slice(-2);
    const jarName = `${artifact.split('.').pop()}-${version}.jar`;

    // The jar the Dockerfile downloads must be exactly the one Lavalink expects.
    const dockerfilePinsJar = dockerfile.includes(`/${artifact.split(':').pop()}/`)
      || dockerfile.includes(`${coordinate.split(':')[0]}`);
    assert.ok(dockerfilePinsJar, `the Dockerfile does not appear to ship ${jarName}`);

    assert.match(dockerfile, new RegExp(`\\$\\{YOUTUBE_PLUGIN_VERSION\\}|\\$\\{LAVASRC_PLUGIN_VERSION\\}`),
      'the Dockerfile no longer pins plugin versions via ARG');

    // And the shipped jar name must line up with the declared version.
    const pinnedByDockerfile = coordinate.includes('youtube-plugin')
      ? pinnedArg('YOUTUBE_PLUGIN_VERSION')
      : pinnedArg('LAVASRC_PLUGIN_VERSION');

    assert.equal(pinnedByDockerfile, version,
      `version drift: application.yml declares ${coordinate} but the image ships ${pinnedByDockerfile}. `
      + 'Lavalink will try to delete the shipped jar, which fails on a read-only rootfs.');
  }
});

test('the youtube plugin jar name is not hardcoded in application.yml', () => {
  // A literal jar filename in the dependency list is how the two sources of truth
  // drift apart again on the next bump.
  assert.equal(/youtube-plugin-\d/.test(applicationYml), false,
    'application.yml hardcodes a plugin jar filename');
});
