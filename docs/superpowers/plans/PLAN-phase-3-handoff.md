# Phase 3 Handoff — Persistence and Sharding

Phase: 3 (persistence, migration, sharding safety)
Branch: `auralyn/phase-3-persistence-sharding`
Plan: `docs/superpowers/plans/PLAN-phase-3-persistence-sharding.md`
Spec: `docs/superpowers/specs/2026-09-24-auralyn-stabilization-and-full-roadmap-design.md`

**No live Discord or Lavalink smoke test was run.** Every result below comes from
`node --test` against hermetic fakes and stubbed transports. Nothing in this phase
connected to Discord's gateway or a Lavalink node.

## Verification summary

232 tests, 232 pass, 0 fail. Run repeatedly (8 full-suite runs across the final
slices) with no flake and no ordering dependence.

All execution ran on the remote Linux host via `scripts/remote-test.sh`, which
rsyncs the working tree and runs `node --test` there. The local machine was used
only for editing, git, and static checks.

## Changed paths

Production:

- `src/utils/atomic-json.js`, `src/utils/storage-lock.js` — atomic writes, corruption
  quarantine, cross-process locking (Task 1)
- `src/utils/guild-settings.js`, `src/utils/session-store.js`, `src/utils/data-dir.js`,
  `src/index.js` — per-guild settings, revision envelopes, tombstones, migration (Task 2)
- `src/music/player.js`, `src/events/ready.js` — lifecycle split, session restore (Task 3)
- `src/utils/deploy-commands.js`, `src/index.js` — deployment ownership by runtime role (Task 4)
- `src/shard.js`, `src/shard-manager.js`, `src/index.js` — shard shutdown without force-kill (Task 5)
- `src/utils/playlist-store.js`, `src/utils/liked-store.js` — atomic, lock-guarded user stores (Task 6)
- `src/utils/spotify-yt-cache.js` — merge under lock, quarantine, owned debounce (Tasks 6, 7)
- `src/utils/timer-registry.js` — timer ownership (Task 7, new)
- `src/events/voiceStateUpdate.js` — empty channel disconnects instead of stopping (audit fix)

Tests added this phase: `user-store-persistence`, `cache-persistence`,
`timer-ownership`, `voice-empty-channel`; helpers `shutdown-single-flight`.
Extended: `shard-ipc`, `deployment-ownership`.

## Migration and corruption results

- Legacy settings and legacy sessions both migrate once, idempotently, never delete their
  source, and never overwrite an existing canonical value. Covered by
  `store-migration.test.js` and `legacy-migration-e2e.test.js`.
- An unparseable file is moved to `<name>.corrupt-<ts>` and that reader falls back to
  empty. One corrupt file cannot block another guild or user.
  Covered by `storage-primitives`, `user-store-persistence`, `cache-persistence`.
- Every read-modify-write re-reads the canonical file inside `withFileLock`, so a second
  writer cannot erase a first writer's entries. Covered by `storage-contention` and
  `user-store-persistence`.

## Restart evidence

- Settings survive a restart and stay isolated per guild (`guild-settings-store`).
- A restart restores sessions into logical state without connecting to voice; reattachment
  waits for the Lavalink-ready event (`session-restore`).
- A guild whose last outcome was a destructive stop is skipped on restore; `save()` clears
  the tombstone (`session-tombstone`).
- A write whose `updatedAt` predates what is stored is rejected with `StaleRevisionError`,
  so a slow shard cannot roll back a guild's queue (`session-envelope`).

## Deployment ownership

Global scope belongs to the manager or to a standalone process, decided by
`isManagedChildProcess()` reading `SHARDING_MANAGER`. A managed child never issues a
global PUT, with or without `GUILD_ID` set. A standalone process with no `GUILD_ID` deploys
global exactly once; with a `GUILD_ID` it stays guild-only. Covered by
`deployment-ownership` (12 tests, including PUT-level assertions on both standalone shapes).

## Shutdown evidence

- The manager waits for each child's `death`. No child is ever force-killed
  (`shard-manager`).
- A child that never exits is reported and leaves `process.exitCode = 1`; it is not killed.
- Manager timers are registered and disposed on both the success and the timeout path.
- The typed protocol is `{ op: 'graceful_shutdown' }`. Any other message is ignored and the
  child keeps running (`shard-ipc`).
- Shutdown is single flight: a second trigger returns the same promise rather than starting
  a second teardown. This was a real defect found during closeout — see below.
- `MusicPlayer.shutdown()` releases every registered timer and reports `timersReleased`.

## Defects found and fixed during closeout

Recorded because they were found by auditing, not by a reported failure, and each one had
already been marked complete.

1. **`voiceStateUpdate` destroyed the queue when the last human left.** It called
   `musicPlayer.stop()`, the destructive operation that clears the queue and the persisted
   session, so the ordinary case of everyone stepping out permanently deleted what was
   playing. `src/music/AGENTS.md` already documented `disconnect()` as the required call;
   the implementation had drifted. The handler had no test at all, which is why. Fixed in
   `52a0845`, pinned by `voice-empty-channel.test.js` across all five branches.

2. **`shutdown` had no single-flight guard.** `process.once` dedupes repeated signals but
   not a signal and a typed manager message arriving together, nor repeated messages (the
   IPC handler used `process.on`). Two teardowns would flush the cache and destroy the
   client twice, and the first `process.exit(0)` would truncate the second's writes. The
   plan's Task 5 checklist asserted this guard already existed; it did not. Fixed by
   memoizing the in-flight promise.

3. **Timer leaks were undetectable by the obvious method.** `process.getActiveResourcesInfo()`
   only lists timers that hold the event loop open, and every registry timer is `unref()`ed,
   so a resource-counting leak test reports zero leaks even when one exists. The tests now
   assert the observable failure instead: after `dispose()`, the callback never fires.

## Known deviation, deliberately not fixed

**Sessions are not one file per guild.** The spec requires one session file per guild
(lines 37-38, and "per-guild/per-user stores" at line 138). Every guild still shares a
single `sessions.json` containing `{ sessions: {...}, stopped: {...} }`, so all guilds
contend on one lock and one file. Settings are correctly one file per guild; sessions are not.

Related: `JsonSessionStore`'s `tombstonePath` constructor option is dead. It is accepted and
given a default but never read; tombstones live in the `stopped` map inside `sessions.json`.
This is recorded in `src/utils/AGENTS.md` so no caller depends on it.

Left unfixed deliberately: splitting the session store is roughly the size of Task 2, and it
needs its own migration for the already-written `sessions.json`. Doing that inside a Task 6-7
closeout, against a green suite, would be the wrong trade. It needs its own task with its own
TDD cycle.

## Unmet exit criterion

**"A single host runs the documented shard count safely" is NOT met.**

It is not hermetically verifiable here. Verifying it needs a real multi-process host under
real load, which is operational work, not a unit test. This must not be reported as passed.

## Deferred, per plan non-goals

- Filter stack-versus-replace contract resolution and exhaustive filter rebinding.
- A general mutation scheduler, per-guild player-map redesign, custom shard factories.
- Docker, Compose, supervisor scripts, Lavalink readiness probes, egg packaging, CI.
- Settings-command durability for commands that only write settings.

## Constraints held

- No new runtime dependencies. `discord.js@14.26.4` and `shoukaku@4.3.0` unchanged.
- No live network calls in any test.
- Every fix was preceded by a behavioral RED against a currently exported symbol. Three
  REDs were confirmed invalid and repaired rather than shipped: a child-process harness using
  a top-level `return`, a fake `channel.members` that was a `Map` instead of a discord.js
  `Collection`, and a test asserting on a scenario the handler was never asked about.
- Every slice is one atomic commit; production change and its DOX update are not always
  co-located, and this handoff records the deviation rather than hiding it.
- **The knowledge graph is NOT current.** The project convention is to run
  `graphify update .` after code changes, but `graphify` is not installed on this machine
  (not on `PATH`, and neither `~/.claude/skills/graphify` nor an installed package exists).
  `graphify-out/` still reflects the pre-Phase-3 tree, so treat the graph as stale for the
  whole of Phase 3 until `graphify update .` is run where the tool exists. This was not
  silently skipped.