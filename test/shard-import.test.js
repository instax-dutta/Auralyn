import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Imports src/shard.js in a child and reports what happened at import time.
 * A token is supplied so the guard does not exit early and mask the result.
 */
async function importShard() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-import-'));
  const scriptPath = path.join(dir, 'probe.mjs');
  const reportPath = path.join(dir, 'report.json');

  const probe = [
    'const fs = await import("node:fs/promises");',
    'const before = process.listenerCount("SIGINT") + process.listenerCount("SIGTERM");',
    `await import(${JSON.stringify(path.join(REPO, 'src/shard.js'))});`,
    'const after = process.listenerCount("SIGINT") + process.listenerCount("SIGTERM");',
    `await fs.writeFile(${JSON.stringify(reportPath)}, JSON.stringify({ imported: true, signalHandlersAdded: after - before }), "utf8");`,
  ].join('\n');

  await writeFile(scriptPath, probe, 'utf8');

  let exitCode = 0;
  let stderr = '';
  try {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      timeout: 20_000,
      env: { ...process.env, DISCORD_TOKEN: 'test-token', CLIENT_ID: 'test-client' },
    });
    stderr = result.stderr;
  } catch (error) {
    exitCode = error.code ?? 1;
    stderr = error.stderr ?? '';
  }

  let report = null;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    // left null when the import never completed
  }

  return { exitCode, report, stderr };
}

test('importing src/shard.js does not register process signal handlers', async () => {
  const { report, stderr } = await importShard();

  assert.ok(report, `the module never finished importing: ${stderr}`);
  assert.equal(
    report.signalHandlersAdded,
    0,
    'importing src/shard.js registered SIGINT/SIGTERM handlers',
  );
});

test('importing src/shard.js does not exit the process', async () => {
  const { exitCode, stderr } = await importShard();

  assert.notEqual(exitCode, 1, `importing src/shard.js exited with a failure: ${stderr}`);
});

test('importing src/shard.js completes without a gateway connection', async () => {
  const { report } = await importShard();

  assert.equal(report.imported, true);
});

test('the manager module itself is importable without a gateway', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-mgr-import-'));
  const scriptPath = path.join(dir, 'probe.mjs');
  const outPath = path.join(dir, 'out.json');

  await writeFile(scriptPath, [
    `const mod = await import(${JSON.stringify(path.join(REPO, 'src/shard-manager.js'))});`,
    `await (await import("node:fs/promises")).writeFile(${JSON.stringify(outPath)}, JSON.stringify({`,
    '  hasClass: typeof mod.HyperscaleShardManager === "function",',
    '  hasConfig: typeof mod.readShardManagerConfig === "function",',
    '}), "utf8");',
  ].join('\n'), 'utf8');

  await execFileAsync(process.execPath, [scriptPath], { timeout: 20_000 });

  const out = JSON.parse(await readFile(outPath, 'utf8'));

  assert.equal(out.hasClass, true);
  assert.equal(out.hasConfig, true);
});