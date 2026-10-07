import { pathToFileURL } from 'node:url';

/**
 * True when `moduleUrl` is the entrypoint Node was asked to run.
 *
 * Both `src/index.js` and `src/shard.js` are importable without side effects by
 * gating their bootstrap on this, so a wrong answer is silent: the process loads,
 * passes every test, and never starts.
 *
 * `pathToFileURL` is mandatory. Building the URL by string concatenation
 * (`file://${argv[1]}`) mis-parses any path containing `#` (it starts a URL
 * fragment) or `%` (it starts an escape), so the comparison fails and the
 * bootstrap silently never runs. `pathToFileURL` encodes the path correctly.
 */
export function isMainModule(moduleUrl, argv1) {
  if (!argv1 || !moduleUrl) return false;

  try {
    return pathToFileURL(argv1).href === moduleUrl;
  } catch {
    return false;
  }
}