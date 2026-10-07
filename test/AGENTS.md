# test — Automated Test Suite

## Purpose

Hermetic unit tests for Auralyn using Node's built-in test runner (`node --test`).

## Ownership

- All `test/*.test.js` files
- Keeping suites in sync with `src/` behavior

## Local Contracts

- Run with `npm test` (maps to `node --test`).
- ESM: import implementation modules directly from `src/`.
- Hermetic: no Discord or Lavalink network calls; Shoukaku/client are stubbed or mocked (see `music-player.test.js`).
- `npm test` is bare `node --test`, which discovers and runs EVERY `.js` file under `test/`, including `test/helpers/`. Every helper must therefore be inert when executed as a top-level script: export its entrypoint and do nothing unless invoked.
- `test/helpers/` doubles: `discord-interaction.js` (reply/defer/edit/update lifecycle) and `shard-child.js` (forked bootstrap that imports `src/index.js` without calling `main()`).
- Suite map:
  - `commands-load.test.js` — every `src/commands` file exports `data` + `execute` and registers under `data.name`
  - `deploy-commands.test.js` — command payload building for registration
  - `music-player.test.js` — player lifecycle, queue, disconnect (stubbed Shoukaku)
  - `autoplay.test.js` — autoplay/next-track behavior
  - `track-scoring.test.js` — best-match ranking determinism
  - `settings-and-ops.test.js` — guild settings and operational stores
  - `audio-filters.test.js` — filter preset mapping
  - `time-parser.test.js` — duration parsing
  - `ui-and-logging.test.js` — embed builders and logger
  - `static-contracts.test.js` — no `/app/data` outside `data-dir.js`; `loadConfig()` fails fast on missing required env
  - `command-deployment-state.test.js` — per-target deployment state (one scope must not suppress another)
  - `deploy-retry.test.js` — `deployWithRetry`: 429-only retry, `Retry-After`, bounded attempts, no retry on other failures
  - `interaction-ids.test.js` — every custom-ID family parses, including names containing `:`
  - `component-routing.test.js` — button routing and cross-guild / cross-user rejection
  - `command-restrictions.test.js` — `/restrict` enforced centrally for every mutating command
  - `commands-playnext.test.js` — `enqueueFront` options contract, idle start, requester metadata
  - `commands-forcefix.test.js` — order-preserving restore and playback resume
  - `shard-ipc.test.js` — forks `test/helpers/shard-child.js`, asserts typed shutdown exits 0
  - `test/helpers/shutdown-single-flight.js` — forked helper proving two concurrent shutdown triggers return the same promise
    - Every helper must be inert when run directly: `node --test` executes all of `test/`. Gate on `typeof process.send === 'function'`.
  - `storage-primitives.test.js` — atomic replacement, read-back, corrupt-file quarantine
  - `storage-lock.test.js` — lock release, dead/abandoned-owner reclamation, heartbeat
  - `storage-contention.test.js` — cross-instance and cross-process writes
  - `guild-settings-store.test.js` — one file per guild, isolation, restart
  - `session-envelope.test.js` — revision envelope, stale-write rejection
  - `session-tombstone.test.js` — durable stop records
  - `store-migration.test.js` — legacy migration precedence and idempotency
  - `legacy-migration-e2e.test.js` — a full pre-Phase-3 data directory upgrades intact
  - `session-lifecycle.test.js` — disconnect vs stop vs shutdown semantics
  - `session-restore.test.js` — restart hydration, tombstone skip, Lavalink reattach
  - `deployment-ownership.test.js` — manager owns global scope, GUILD_ID never changes ownership
  - `shard-manager.test.js` — no force-kill, timeout reporting, timer disposal, driven from a child
  - `shard-import.test.js` — importing the shard entrypoint has no side effects
  - `user-store-persistence.test.js` — playlist/liked stores are atomic, per-user isolated, and safe against concurrent instances; each case runs in a child process because `data-dir.js` reads `DATA_DIR` at import time
  - `cache-persistence.test.js` — Spotify→YT cache merges under the lock, quarantines corruption, keeps expired entries off disk, and owns its debounce timer
  - `timer-ownership.test.js` — every registry timer is released by `dispose()`; asserts a disposed callback stops firing, because unref'd timers are invisible to `process.getActiveResourcesInfo()`
  - `voice-empty-channel.test.js` — `voiceStateUpdate.js` disconnects (not stops) on an empty channel, across all five branches
  - `is-main-module.test.js` — the entrypoint guard resolves correctly, including paths containing `#` and `%` that break naive URL concatenation
  - `persist-failure-resilience.test.js` — a read-only data directory must not crash the player; failures are logged once per outage, not per event

## TDD Gate

Every production change follows the spec gate: write a behavioral RED that drives a currently exported symbol, confirm the failure, make the smallest change, confirm GREEN, run `npm test`. A missing export, missing module, import exception, or future constructor option is never a valid RED.

## Work Guidance

- Any new `src/` behavior gets a matching `.test.js` here.
- When a test fakes a discord.js collection (e.g. `channel.members`), use a real `Collection`, not a `Map`: the production code calls `.filter(...).size`, which a bare `Map` does not provide.
- When a RED fails on a fixture error (`x.filter is not a function`) or an assertion about a scenario the handler was never asked about, fix the fixture first and re-confirm the RED names the real defect.
- Keep tests fast and offline; never add network-dependent fixtures.

## Verification

- `npm test` is green.

## Child DOX Index

- None (flat file set).
