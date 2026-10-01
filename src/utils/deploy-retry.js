const BASE_BACKOFF_MS = 1_000;

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function retryAfterMs(error) {
  const headers = error?.rawError?.headers ?? error?.response?.headers;
  const raw = headers?.get?.('retry-after') ?? error?.headers?.get?.('Retry-After');
  if (raw === undefined || raw === null) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1_000 : null;
}

function isRateLimited(error) {
  return error?.status === 429 || error?.code === 429 || error?.name === 'RateLimitError';
}

/**
 * Runs `request` and retries a rate-limited attempt a bounded number of times.
 * The first attempt is not counted as a retry, so the maximum number of
 * attempts is `maxRetries + 1`. Failures that are not rate limits are
 * surfaced immediately.
 */
export async function deployWithRetry(request, { maxRetries = 2, timerRegistry } = {}) {
  const wait = timerRegistry
    ? ms => timerRegistry.sleep(ms)
    : sleep;

  let attempt = 0;

  for (;;) {
    try {
      return await request(attempt);
    } catch (error) {
      if (!isRateLimited(error) || attempt >= maxRetries) throw error;
      attempt += 1;

      const hinted = retryAfterMs(error);
      const backoff = hinted ?? BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await wait(backoff);
    }
  }
}