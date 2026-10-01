import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve('.');

test('every persisted path is built through data-dir.js rather than a hardcoded /app/data', async () => {
  const offenders = [];

  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(full);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const source = await readFile(full, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('/app/data') && !line.trimStart().startsWith('*') && !line.includes('//')) {
          offenders.push(`${path.relative(ROOT, full)}:${index + 1}`);
        }
      });
    }
  }

  await scan(path.join(ROOT, 'src'));

  assert.deepEqual(
    offenders.filter(file => file !== path.join('src', 'utils', 'data-dir.js')),
    [],
    `hardcoded /app/data outside data-dir.js: ${offenders.join(', ')}`,
  );
});

test('loadConfig rejects a missing required variable with a named message', async () => {
  await assert.rejects(
    () => import('../src/config.js').then(m => m.loadConfig()),
    /Missing required environment variable/,
  );
});

test('loadConfig fails fast rather than returning a partially valid config', async () => {
  const script = `
    process.env.DISCORD_TOKEN = 'token';
    process.env.CLIENT_ID = 'client';
    delete process.env.LAVALINK_PASSWORD;
    const { loadConfig } = await import('./src/config.js');
    try {
      loadConfig();
      process.stdout.write('NO_THROW');
    } catch (error) {
      process.stdout.write(error.message);
    }
  `;

  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: ROOT,
    env: { ...process.env, DISCORD_TOKEN: undefined, CLIENT_ID: undefined, LAVALINK_PASSWORD: undefined },
    timeout: 10_000,
  });

  assert.match(stdout, /LAVALINK_PASSWORD/);
  assert.doesNotMatch(stdout, /NO_THROW/);
});

test('dataPath resolves beneath the configured DATA_DIR', async () => {
  const script = `
    const { dataPath } = await import('./src/utils/data-dir.js');
    process.stdout.write(JSON.stringify({
      root: dataPath(),
      nested: dataPath('guilds', 'guild-1', 'settings.json'),
    }));
  `;

  const dataRoot = '/tmp/auralyn-contract-data';
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: dataRoot },
    timeout: 10_000,
  });

  assert.deepEqual(JSON.parse(stdout), {
    root: dataRoot,
    nested: path.join(dataRoot, 'guilds', 'guild-1', 'settings.json'),
  });
});