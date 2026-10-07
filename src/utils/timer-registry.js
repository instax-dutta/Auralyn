/**
 * Tracks the timers a component owns so they can all be released at once.
 *
 * A bare `setInterval` outlives whatever created it. Unref'ing it stops it
 * holding the process open, but the callback still fires against a component
 * that may already have been torn down, and nothing records that the timer
 * exists. Registering timers here makes ownership explicit and gives the owner
 * a single `dispose()` that cannot miss one.
 *
 * Handles from a foreign timer must never be passed to `clear()`: clearing a
 * handle this registry does not own would be a no-op the caller cannot detect.
 * Callers keep using the native `clearTimeout`/`clearInterval` for anything
 * they did not obtain here.
 */
export class TimerRegistry {
  constructor({ unref = true } = {}) {
    this.timers = new Set();
    this.unrefTimers = unref;
    this.disposed = false;
  }

  get size() {
    return this.timers.size;
  }

  _adopt(handle) {
    this.timers.add(handle);
    if (this.unrefTimers) handle.unref?.();
    return handle;
  }

  /** Registers a one-shot timer, or returns null once disposed. */
  setTimeout(fn, ms) {
    if (this.disposed) return null;
    return this._adopt(setTimeout(fn, ms));
  }

  /** Registers a repeating timer, or returns null once disposed. */
  setInterval(fn, ms) {
    if (this.disposed) return null;
    return this._adopt(setInterval(fn, ms));
  }

  /**
   * Releases one owned timer and stops tracking it. Returns false for a handle
   * this registry does not own, so a caller can fall back to the native clear.
   */
  clear(handle) {
    if (!handle || !this.timers.has(handle)) return false;

    this.timers.delete(handle);
    clearTimeout(handle);
    clearInterval(handle);
    return true;
  }

  /** Releases every owned timer. Idempotent: a second call releases nothing. */
  dispose() {
    if (this.disposed) return 0;

    const released = this.timers.size;
    for (const handle of this.timers) {
      clearTimeout(handle);
      clearInterval(handle);
    }
    this.timers.clear();
    this.disposed = true;

    return released;
  }
}