import test from 'node:test';
import assert from 'node:assert/strict';

import { deployWithRetry } from '../src/utils/deploy-retry.js';

class RateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('429: Too Many Requests');
    this.name = 'RateLimitError';
    this.status = 429;
    if (retryAfterSeconds !== undefined) {
      this.rawError = { headers: new Map([['retry-after', String(retryAfterSeconds)]]) };
    }
  }
}

function recordingTimer() {
  const delays = [];
  return {
    delays,
    async sleep(ms) {
      delays.push(ms);
    },
  };
}

test('a rate-limited attempt is retried and then succeeds', async () => {
  const timerRegistry = recordingTimer();
  let attempts = 0;

  const result = await deployWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new RateLimitError(0);
      return 'ok';
    },
    { timerRegistry },
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 2, 'expected exactly one retry');
});

test('retry honours the Retry-After hint in seconds', async () => {
  const timerRegistry = recordingTimer();
  let attempts = 0;

  await deployWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new RateLimitError(3);
      return 'ok';
    },
    { timerRegistry },
  );

  assert.deepEqual(timerRegistry.delays, [3_000]);
});

test('retry falls back to exponential backoff when no hint is present', async () => {
  const timerRegistry = recordingTimer();
  let attempts = 0;

  await deployWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new RateLimitError();
      return 'ok';
    },
    { timerRegistry },
  );

  assert.deepEqual(timerRegistry.delays, [1_000, 2_000]);
});

test('retry gives up after a bounded number of attempts', async () => {
  const timerRegistry = recordingTimer();
  let attempts = 0;

  await assert.rejects(
    () => deployWithRetry(
      async () => {
        attempts += 1;
        throw new RateLimitError(0);
      },
      { timerRegistry },
    ),
    /429/,
  );

  assert.equal(attempts, 3, 'expected the initial attempt plus two retries');
});

test('a non-rate-limit failure is not retried', async () => {
  const timerRegistry = recordingTimer();
  let attempts = 0;

  await assert.rejects(
    () => deployWithRetry(
      async () => {
        attempts += 1;
        throw new Error('401: Unauthorized');
      },
      { timerRegistry },
    ),
    /401/,
  );

  assert.equal(attempts, 1, 'a non-429 failure was retried');
  assert.deepEqual(timerRegistry.delays, []);
});

test('a permanent rate-limit failure surfaces the rate-limit error, not a wrapper', async () => {
  const timerRegistry = recordingTimer();

  const error = await deployWithRetry(
    async () => {
      throw new RateLimitError(0);
    },
    { timerRegistry },
  ).then(() => null, err => err);

  assert.equal(error?.name, 'RateLimitError');
  assert.equal(error?.status, 429);
});