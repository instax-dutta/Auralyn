import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const START_SH = path.join(REPO, 'scripts', 'start.sh');

/**
 * Reproduces the Pterodactyl failure:
 *
 *   Error: EROFS: read-only file system, open '/app/data/sessions.json.lock'
 *
 * Pterodactyl runs containers with a read-only rootfs, so the compiled-in
 * default DATA_DIR (/app/data) cannot be written. The only writable path is the
 * /home/container bind mount. Nothing set DATA_DIR, so every boot fell back to
 * the unwritable default and persistence was dead from the first start.
 *
 * These tests drive the real script with a stubbed Lavalink/node so the data
 * dir resolution can be observed without launching Java.
 */

// start.sh backgrounds Lavalink and the bot, then supervises them. Stubs that
// exit immediately make the supervisor abort with "process stopped", but the
// output the bot stub already wrote is flushed first, which is what these tests
// read. Lingering stubs are worse: they inherit the stdout pipe and execFile
// then blocks until they exit.
const STUB = `#!/bin/sh
echo "DATA_DIR_SEEN=[$DATA_DIR]"
`;

async function runStart({ dataDir, defaultWritable = true, fallbackWritable = true }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-startsh-'));

  // A stand-in APP_DIR so the script never touches the real /app.
  const appDir = path.join(dir, 'app');
  const lavalinkDir = path.join(appDir, 'lavalink');
  const fallback = path.join(dir, 'fallback');

  const fs = { mkdir, writeFile };
  await mkdir(lavalinkDir, { recursive: true });
  await writeFile(path.join(lavalinkDir, 'Lavalink.jar'), 'stub', 'utf8');
  await writeFile(path.join(lavalinkDir, 'application.yml'), 'stub', 'utf8');

  // Every stub must live in the same dir that leads PATH, otherwise the real
  // node runs and this test silently stops exercising start.sh. chmod is
  // explicit: relying on writeFile's mode option left the stubs non-executable
  // here, and start.sh then died at its first `node --version`.
  for (const name of ['node', 'curl', 'java']) {
    const stubPath = path.join(dir, name);
    await fs.writeFile(stubPath, STUB);
    await chmod(stubPath, 0o755);
  }

  // A stand-in for the read-only rootfs default. start.sh probes DATA_DIR_DEFAULT
  // first and only then falls back, so the default has to genuinely be unwritable
  // to reproduce Pterodactyl; a writable one makes the fallback untested.
  const defaultDir = path.join(appDir, 'data');
  await mkdir(defaultDir, { recursive: true });
  await mkdir(fallback, { recursive: true });
  if (!defaultWritable) await chmod(defaultDir, 0o555);
  if (!fallbackWritable) await chmod(fallback, 0o555);

  const env = {
    ...process.env,
    APP_DIR: appDir,
    LAVALINK_DIR: lavalinkDir,
    LAVALINK_PORT: '2333',
    LAVALINK_PASSWORD: 'test',
    LAVALINK_STARTUP_TIMEOUT: '2',
    DISCORD_TOKEN: 'test-token',
    CLIENT_ID: 'test-client',
    // DATA_DIR_DEFAULT is always injected so the read-only default can be
    // modelled. DATA_DIR itself is only set when the caller supplied one, which
    // is what exercises the "explicit configuration is honoured" path.
    DATA_DIR: dataDir ?? defaultDir,
    DATA_DIR_DEFAULT: defaultDir,
    DATA_DIR_FALLBACK: fallback,
    PATH: `${dir}:${process.env.PATH}`,
  };

  // Only set DATA_DIR when the caller supplied one, so the script's own default
  // resolution is what gets exercised.
  if (dataDir === undefined) delete env.DATA_DIR;

  // A non-zero exit is expected here: the supervisor notices its stub children
  // exited. Only the reported output matters to these assertions.
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    // Invoke through sh: the script is not marked executable in git (mode 644),
    // so execFile on it directly fails with EACCES on a fresh checkout.
    const result = await execFileAsync('sh', [START_SH], { env, timeout: 20_000 });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
    exitCode = error.code ?? 1;
  }

  return { stdout, stderr, exitCode, fallback, defaultDir };
}

test('an explicit DATA_DIR is never overridden', async () => {
  const explicit = '/tmp/explicit-data';
  const { stdout, stderr } = await runStart({ dataDir: explicit });
  const seen = `stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`;

  assert.match(stdout, /DATA_DIR_SEEN=/, `the stubbed node never ran: ${seen}`);
  assert.match(stdout, new RegExp(`DATA_DIR_SEEN=\\[?${explicit}\\]?`),
    `start.sh overrode an explicitly configured DATA_DIR: ${seen}`);
});

test('the script resolves a data dir the container can actually write', async () => {
  // No DATA_DIR supplied: exactly the Pterodactyl situation.
  const { stdout } = await runStart({ dataDir: undefined, defaultWritable: false });

  assert.match(stdout, /DATA_DIR_SEEN=/, 'the stubbed node never ran');

  const resolved = stdout.match(/DATA_DIR_SEEN=\[?([^\]\s]*)\]?/)?.[1];
  assert.ok(resolved, `could not read the resolved DATA_DIR from:\n${stdout}`);

  const { defaultDir } = await runStart({ dataDir: undefined, defaultWritable: false });
  assert.notEqual(resolved, defaultDir,
    'the script kept the unwritable default data dir, which is the EROFS root cause');
});

test('the resolved data dir is the writable fallback, not the unwritable default', async () => {
  const { stdout, fallback } = await runStart({ dataDir: undefined, defaultWritable: false });

  const resolved = stdout.match(/DATA_DIR_SEEN=\[?([^\]\s]*)\]?/)?.[1];
  assert.equal(resolved, fallback,
    `the script did not fall back to the only writable path: stdout=${JSON.stringify(stdout)}`);
});

test('an unwritable data dir is reported and refused, never silently accepted', async () => {
  const { stdout, stderr, exitCode } = await runStart({
    dataDir: undefined,
    defaultWritable: false,
    fallbackWritable: false,
  });

  const combined = stdout + stderr;
  assert.match(combined, /no writable data directory/i,
    `a data dir that cannot be written was not reported:\n${combined}`);
  assert.equal(exitCode, 78,
    'the script did not exit with the documented config-error code, so a caller cannot detect it');
});

test('the script still enforces its documented exit codes', async () => {
  const source = await readFile(START_SH, 'utf8');
  assert.match(source, /exit 64/, 'the missing-env exit code was removed');
  assert.match(source, /exit 66/, 'the missing-Lavalink exit code was removed');
  assert.match(source, /exit 78/, 'the unusable-data-dir exit code was removed');
});