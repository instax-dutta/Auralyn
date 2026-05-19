export class RateLimiter {
  constructor({ intervalMs = 2000, maxBurst = 5 } = {}) {
    this.intervalMs = intervalMs;
    this.maxBurst = maxBurst;
    this.queue = [];
    this.tokens = maxBurst;
    this.lastRefill = Date.now();
    this.processing = false;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this.refillTokens();
      if (this.tokens <= 0) {
        await this.sleep(this.intervalMs);
        continue;
      }

      this.tokens--;
      const { fn, resolve, reject } = this.queue.shift();
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  refillTokens() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refill = Math.floor(elapsed / this.intervalMs);
    if (refill > 0) {
      this.tokens = Math.min(this.maxBurst, this.tokens + refill);
      this.lastRefill = now;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
