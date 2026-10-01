import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';

const CHILD_PATH = path.resolve('test/helpers/shard-child.js');
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