import { writeFileSync } from 'node:fs';

/**
 * Drives the exported shutdown twice, concurrently, and reports whether the two
 * triggers collapsed into one teardown.
 *
 * It forks so that a real teardown's process.exit(0) is survivable, and so that
 * running this file directly under `node --test` is inert: `node --test`
 * discovers and executes every file under `test/`, helpers included.
 *
 * The report is written from an `exit` handler because that still runs during
 * process.exit(), whereas the awaited continuation after it never does.
 */
if (typeof process.send === 'function') {
  const reportPath = process.argv[2];

  process.on('exit', () => {
    writeFileSync(reportPath, JSON.stringify({
      samePromise: globalThis.__shutdownSamePromise === true,
      secondWasPromise: globalThis.__shutdownSecondWasPromise === true,
      error: globalThis.__shutdownError ?? null,
    }), 'utf8');
  });

  const { shutdown } = await import('../../src/index.js');

  try {
    const first = shutdown('first-trigger');
    const second = shutdown('second-trigger');

    globalThis.__shutdownSecondWasPromise = typeof second?.then === 'function';
    globalThis.__shutdownSamePromise = first === second;

    // Let the single teardown run; it exits the process itself.
    await first;
  } catch (error) {
    globalThis.__shutdownError = error.message;
  }
}