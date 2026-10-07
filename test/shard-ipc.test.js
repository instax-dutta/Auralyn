import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CHILD_PATH = path.resolve('test/helpers/shard-child.js');
const SINGLE_FLIGHT_CHILD = path.resolve('test/helpers/shutdown-single-flight.js');
const READY_TIMEOUT_MS = 5_000;
const EXIT_TIMEOUT_MS = 5_000;

const waitForReady = (child, timeoutMs) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timer);
    child.off('message', onMessage);
    child.off('error', onError);
    child.off('exit', onExit);
  };
  const onMessage = message => {
    if (message?.type !== 'ready') return;
    cleanup();
    resolve(message);
  };
  const onError = error => {
    cleanup();
    reject(new Error(`shard child failed before readiness: ${error.message}`));
  };
  const onExit = (code, signal) => {
    cleanup();
    reject(new Error(`shard child exited before readiness (code=${code}, signal=${signal})`));
  };
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error(`shard child did not report readiness within ${timeoutMs}ms`));
  }, timeoutMs);

  child.on('message', onMessage);
  child.on('error', onError);
  child.on('exit', onExit);
});

const withTimeout = (promise, timeoutMs) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(null), timeoutMs);
  promise.then(value => {
    clearTimeout(timer);
    resolve(value);
  });
});

function forkChild() {
  return fork(CHILD_PATH, [], {
    env: {
      ...process.env,
      DISCORD_TOKEN: 'test-token',
      CLIENT_ID: 'test-client',
      LAVALINK_PASSWORD: 'test-password',
      LAVALINK_HOST: '127.0.0.1',
      LAVALINK_PORT: '1',
      LAVALINK_SECURE: 'false',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
}

test('child entrypoint exits with code 0 after the manager sends graceful_shutdown', async () => {
  const child = forkChild();

  const exitPromise = new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  try {
    const readyMessage = await waitForReady(child, READY_TIMEOUT_MS);
    assert.deepEqual(readyMessage, { type: 'ready' });

    await new Promise((resolve, reject) => {
      child.send({ op: 'graceful_shutdown' }, error => {
        if (error) reject(error);
        else resolve();
      });
    });

    const exitResult = await withTimeout(exitPromise, EXIT_TIMEOUT_MS);
    assert.ok(exitResult, "child entrypoint ignores the manager's graceful-shutdown message");
    assert.equal(exitResult.code, 0, 'child must exit with code 0');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exitPromise;
  }
});

test('an unknown op is ignored and the child keeps running', async () => {
  const child = forkChild();

  const exitPromise = new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  try {
    await waitForReady(child, READY_TIMEOUT_MS);

    await new Promise((resolve, reject) => {
      child.send({ op: 'not_a_real_op' }, error => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
      child.send('total garbage', error => (error ? reject(error) : resolve()));
    });

    // Give the handler a chance to misfire, then confirm it is still alive.
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.equal(child.exitCode, null,
      'an unknown message shut the child down; the protocol must ignore anything but graceful_shutdown');

    // It must still honour the one message that is real.
    await new Promise((resolve, reject) => {
      child.send({ op: 'graceful_shutdown' }, error => (error ? reject(error) : resolve()));
    });

    const exitResult = await withTimeout(exitPromise, EXIT_TIMEOUT_MS);
    assert.equal(exitResult?.code, 0, 'child did not exit after the real shutdown message');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exitPromise;
  }
});

test('concurrent shutdown triggers collapse into one teardown', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-single-flight-'));
  const reportPath = path.join(dir, 'report.json');

  const child = fork(SINGLE_FLIGHT_CHILD, [reportPath], {
    env: {
      ...process.env,
      DATA_DIR: dir,
      DISCORD_TOKEN: 'test-token',
      CLIENT_ID: 'test-client',
      LAVALINK_PASSWORD: 'test-password',
      LAVALINK_HOST: '127.0.0.1',
      LAVALINK_PORT: '1',
      LAVALINK_SECURE: 'false',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  const exitResult = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  const report = JSON.parse(await readFile(reportPath, 'utf8'));

  assert.equal(report.error, null, `shutdown threw: ${report.error}`);
  assert.equal(exitResult.code, 0, 'the single teardown did not exit cleanly');
  assert.equal(report.secondWasPromise, true, 'shutdown did not return a promise');
  assert.equal(report.samePromise, true,
    'a second shutdown trigger started a second teardown; the cache would flush and the client would be destroyed twice');
});