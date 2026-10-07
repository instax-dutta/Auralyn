import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CHILD = fileURLToPath(new URL('./helpers/shard-manager-child.js', import.meta.url));

/**
 * Shutdown runs in a child process because a correct implementation may call
 * process.exit, and because the current one does. The child writes a report to
 * a file so the evidence survives that exit.
 */
async function runShutdown(mode) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-shard-mgr-'));
  const reportPath = path.join(dir, 'report.json');

  // A timed-out shutdown deliberately exits non-zero, so the child's exit
  // status is data here, not a test-runner failure.
  let childExit = 0;
  try {
    await execFileAsync(process.execPath, [CHILD, mode, reportPath], { timeout: 20_000 });
  } catch (error) {
    childExit = error.code ?? 1;
  }

  const raw = await readFile(reportPath, 'utf8');
  return { ...JSON.parse(raw), childExit };
}

test('a shutdown that completes writes its report', async () => {
  const report = await runShutdown('clean');

  assert.equal(report.error, undefined, `shutdown failed: ${report.error}`);
  assert.equal(report.completed, true);
});

test('a child that exits gracefully is never force-killed', async () => {
  const report = await runShutdown('clean');

  assert.deepEqual(report.killed, [0, 0], 'a child that exited cleanly was force-killed');
});

test('each child receives exactly the typed shutdown message', async () => {
  const report = await runShutdown('clean');

  assert.deepEqual(
    report.sent,
    [[{ op: 'graceful_shutdown' }], [{ op: 'graceful_shutdown' }]],
    'children did not each receive exactly one typed shutdown message',
  );
});

test('shutdown stops respawning before asking children to stop', async () => {
  const report = await runShutdown('clean');

  assert.equal(report.respawn, false, 'children would be respawned while shutting down');
});

test('a child that never exits is reported, not killed', async () => {
  const report = await runShutdown('hang');

  assert.deepEqual(report.killed, [0, 0], 'a hung child was force-killed at the timeout');
});

test('a timed-out shutdown surfaces a non-zero exit code', async () => {
  const report = await runShutdown('hang');

  assert.equal(report.exitCode, 1, 'a timed-out shutdown did not surface a failure');
});

test('a clean shutdown does not report a failure', async () => {
  const report = await runShutdown('clean');

  assert.equal(report.exitCode, 0);
});