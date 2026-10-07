# Auralyn Phase 3 — Persistence and Sharding

Spec: `docs/superpowers/specs/2026-09-24-auralyn-stabilization-and-full-roadmap-design.md`, lines 135–144.
Status: written against commit `768dba1`, where `npm test` is 102/102 green.

Every slice below follows the spec's TDD gate: write one behavioral RED against a
currently exported symbol, confirm the failure, make the smallest change, confirm
GREEN, run `npm test`. A missing export, missing module, import exception, or future
constructor option is never a valid RED.

## Already delivered by Phase 0–2 fixes

These spec bullets are satisfied and are **not** re-planned:

- Route all persistence through `dataPath()` — `b6a005d`.
- Per-target deployment state so one scope cannot suppress another — `4133b31`.
- Bounded 429 retry — `50775c7`.
- Typed shutdown message handled by the child — `b297e01`.
- `/restrict` enforced centrally for every command — `23e4475`.

## Verified current gaps

Each line was checked against `768dba1` before this plan was written.

| Gap | Evidence |
| --- | --- |
| Sessions are written but never read back | `src/music/player.js` `persistGuildState` is the only `sessionStore` caller outside `src/index.js:98`; `src/events/ready.js` touches no store, and the `shoukaku.on('ready')` subscriber at `src/index.js:153` only logs |
| One JSON file per store, not per guild | `src/utils/session-store.js:5` takes one `filePath`; `src/utils/guild-settings.js:79` one `DEFAULT_FILE_PATH` |
| Writes are not atomic | `session-store.js:26`, `playlist-store.js:50`, `liked-store.js:47` use bare `writeFile`; `spotify-yt-cache.js:99-102` is the only tmp+rename |
| No cross-process coordination | no lock, no per-path queue; a second store instance writes its whole stale cache back and erases another writer's entry |
| `disconnect()` deletes the session | `src/music/player.js:528` |
| `stop()` routes through `disconnect()` | `src/music/player.js:465` region, so a destructive stop also re-persists |
| Every shard deploys global commands | `src/index.js:207-211` runs in each child; `SHARDING_MANAGER` is read nowhere in `src/` |
| Manager force-kills children | `src/shard.js:117` `shard.send(...)` then `shard.kill()` on both paths |
| Presence timer is never cleared | `src/events/ready.js:23` bare `setInterval` |

---

## Task 1 — Atomic writes, per-path queue, and lock

New: `src/utils/atomic-json.js`, `src/utils/storage-paths.js`
Tests: `test/storage-primitives.test.js`, `test/storage-contention.test.js`

- [x] `atomic replacement and read-back` — RED: driving the current
      `JsonSessionStore({ filePath }).save()` and killing the process mid-write
      leaves a truncated file, because `session-store.js:24` calls `writeFile`
      with no temporary file and no read-back. GREEN: `writeJsonAtomic()` writes a
      sibling temp file, fsyncs, renames, fsyncs the directory, and reads back.
- [x] `quarantine corrupt json` — RED: `JsonSessionStore.ensureLoaded()` at
      `session-store.js:15` throws on malformed JSON, so one bad file prevents
      startup for every guild. GREEN: the corrupt file is moved aside and the
      store starts empty.
- [x] `lost update across store instances` — RED: two `JsonSessionStore` instances
      on one file each cache the file, then each writes the WHOLE cache back, so
      the second write silently erases the first guild's entry. Verified against
      `768dba1`: A saves `g1`, B saves `g2`, and the file ends with only `g2`
      while B's memory still reports `g1` present. GREEN: a write re-reads the
      canonical file and merges under a lock.
- [x] `per-path serialization` — RED: concurrent writes to one path have no
      ordering, so readers observe a partially written file. GREEN: a per-path
      promise chain orders them and rejects overlapping writes for the same path.
- [x] `cross-process lock` — RED: two forked processes writing one file can
      interleave. GREEN: an owner-token lock file with stale-owner reclamation.

## Task 2 — Per-guild settings and session stores, with migration

Modify: `src/utils/guild-settings.js`, `src/utils/session-store.js`, `src/utils/data-dir.js`
Tests: `test/settings-migration.test.js`, `test/session-migration.test.js`

- [x] `per-guild file layout` — RED: `new GuildSettingsStore()` writes one shared
      map for every guild, per `guild-settings.js:79`. GREEN: one file per guild
      under `guilds/<id>/settings.json`, resolved through `dataPath()`.
- [x] `session envelope and write token` — RED: `session-store.js:29` `save()`
      overwrites unconditionally, so a stale writer can clobber a newer session.
      GREEN: the envelope carries `revision` and a write token; a stale write
      throws `StaleRevisionError`.
- [x] `destructive tombstone` — RED: `session-store.js:41` `delete()` removes the
      session with no record that the stop was intentional, so a restart cannot
      distinguish "stopped" from "never played". GREEN: a tombstone file records
      the stop and restore skips it.
- [x] `legacy migration` — RED: with both a legacy flat file and a per-guild file
      present, the legacy content is silently dropped. GREEN: valid canonical wins;
      corrupt canonical with a valid legacy source migrates from legacy and
      quarantines the corrupt file; migration is idempotent and never deletes the
      source before verifying the copy.

## Task 3 — Session restore and stop/disconnect/shutdown semantics

Modify: `src/music/player.js`, `src/events/ready.js`, `src/music/queue.js`
Tests: `test/session-restore.test.js`, `test/session-lifecycle.test.js`

- [x] `restore logical state` — RED: `src/events/ready.js` hydrates nothing, so a
      restart loses the queue. GREEN: the ready handler loads each owned guild's
      session into the queue manager without connecting to voice.
- [x] `reattach after lavalink ready` — RED: the `shoukaku.on('ready')`
      subscriber at `src/index.js:153` only logs and records telemetry; it never
      resumes a restored current track, so a restored queue sits idle. GREEN: that
      subscriber (or a dedicated one) resumes playback at the stored position once
      Lavalink is connected.
- [x] `disconnect is recoverable` — RED: `player.js:528` `disconnect()` deletes the
      persisted session, so an empty voice channel loses the queue on restart.
      GREEN: `disconnect()` flushes a snapshot and keeps it.
- [x] `stop is destructive` — RED: `stop()` reaches `disconnect()`, which under the
      recoverable contract would re-persist the session it is trying to clear.
      GREEN: `stop()` clears through `leaveVoiceOnly()` and writes a tombstone.
- [x] `shutdown preserves recoverable sessions` — RED: shutdown disconnects every
      guild through the destructive path. GREEN: shutdown quiesces admission,
      flushes, and leaves restorable sessions intact.

## Task 4 — Leader-owned command deployment

Modify: `src/index.js`, `src/config.js`, `src/shard.js`
Tests: `test/deployment-ownership.test.js`

- [x] `manager owns global scope` — RED: `src/index.js:207-211` deploys global
      commands in every process, so N shards issue N identical global PUTs and
      race each other. GREEN: only the process that is **not** a managed child
      deploys global. The gate is reliable: discord.js sets `SHARDING_MANAGER:
      true` in every child env at `node_modules/discord.js/src/sharding/Shard.js:70`,
      and the flag is currently read nowhere in `src/`.
- [x] `child owns its guild scope` — RED: no child reacts to `guildCreate` for
      deployment ownership. GREEN: a child deploys only its own guild.
- [x] `GUILD_ID does not change ownership` — RED: `src/utils/deploy-commands.js`
      `getCommandDeploymentTargets()` branches only on `config.guildId`, so a
      managed child with `GUILD_ID` unset still targets global. GREEN: ownership
      is decided by runtime role, not by `GUILD_ID`.
- [ ] `standalone behaviour unchanged` — GREEN guard: a single process still
      deploys global exactly once and its own guild.

## Task 5 — Graceful shard shutdown without force-kill

Modify: `src/shard.js`, `src/index.js`
New: `src/utils/shard-protocol.js`, `src/shard-manager.js`
Tests: `test/shard-manager.test.js`, `test/shard-shutdown.test.js`

- [ ] `typed shutdown protocol` — GREEN guard: `{ op: 'graceful_shutdown' }` is
      the single shutdown message; unknown messages are ignored.
- [ ] `no force kill` — RED: `src/shard.js:117` calls `shard.kill()` after the
      child disconnects, so a healthy child is killed instead of exiting on its
      own. GREEN: the manager waits for the child's exit.
- [ ] `timeout does not kill` — RED: a hung child is killed at the timeout.
      GREEN: timeout records a bounded error and leaves the child to exit itself.
- [ ] `shutdown is single flight` — GREEN guard: `isShuttingDown` is already set
      synchronously at `shard.js:108-109`, so concurrent triggers already return
      early; this locks the behaviour in.
- [ ] `manager timers are disposed` — RED: the health, status, and shutdown-timeout
      timers in `src/shard.js` are never cleared, so the process cannot exit
      cleanly. GREEN: all three are disposed on both the success and timeout paths.
- [ ] `import does not spawn` — RED: `src/shard.js:143-144` constructs the manager
      and spawns at module scope, so the file cannot be imported by a test. GREEN:
      bootstrap moves behind an `isMainModule` guard and the manager lives in
      `src/shard-manager.js`.

## Task 6 — User stores and cache hardening

Modify: `src/utils/playlist-store.js`, `src/utils/liked-store.js`, `src/utils/spotify-yt-cache.js`
Tests: `test/user-store-persistence.test.js`, `test/cache-persistence.test.js`

- [ ] `atomic user store writes` — RED: `playlist-store.js:50` and
      `liked-store.js:47` use bare `writeFile`, so an interrupted write truncates a
      user's playlist. GREEN: both use the Task 1 primitive.
- [ ] `cross-user isolation` — GREEN guard: one user can never read another's file.
- [ ] `cache merge under lock` — RED: `spotify-yt-cache.js:100` writes the whole
      in-memory cache, so two processes each lose the other's entries. GREEN: the
      canonical cache is re-read and merged under the lock before writing.
- [ ] `cache corruption quarantined` — RED: `spotify-yt-cache.js:47` swallows a
      corrupt cache with a warn, so entries are lost silently. GREEN: quarantine
      and start empty.

## Task 7 — Timer ownership and closeout

Modify: `src/events/ready.js`, `src/music/player.js`
Tests: `test/timer-ownership.test.js`

- [ ] `no unowned timers` — RED: `src/events/ready.js:23` and the refresh/sleep
      timers in `src/music/player.js` are bare native timers, so the process is
      held open and they cannot be cancelled. GREEN: every Phase 3 timer is
      registered and disposable.

---

## Explicit non-goals

Deferred, and **not** required for this phase's exit criteria:

- Resolving the single-host multi-shard safety criterion. It is not hermetically
  verifiable here; auto-spawn shutdown hardening belongs with the operational work.
- Filter stack-versus-replace contract resolution and exhaustive filter rebinding.
- A general mutation scheduler or per-guild player-map redesign.
- Docker, Compose, supervisor scripts, Lavalink readiness probes, egg packaging, CI.
- Settings-command durability for commands that only write settings.

## Exit criteria mapping

| Spec exit criterion | Task | Verified by |
| --- | --- | --- |
| Restart preserves expected state | 2, 3 | `session-migration`, `session-restore`, `session-lifecycle` |
| Shard tests preserve expected state | 4, 5 | `deployment-ownership`, `shard-manager`, `shard-shutdown` |
| A single host runs the documented shard count safely | **not met** | Deferred; must be recorded as unmet in the handoff, never as passed |

## Handoff requirements

`docs/superpowers/plans/phase-3-handoff.md` must record: changed paths, migration and
corruption results, restart evidence, deployment ownership, shutdown evidence, the
deferred exit criterion listed above as **unmet**, and an explicit statement that no
live Discord or Lavalink smoke test was run.

DOX updates are required in the same commit as any change that alters a contract:
`src/AGENTS.md`, `src/utils/AGENTS.md`, `src/music/AGENTS.md`,
`src/events/AGENTS.md`, `src/commands/AGENTS.md`, `test/AGENTS.md`.