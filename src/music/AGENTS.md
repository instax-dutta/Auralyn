# src/music — Playback Engine

## Purpose

The Shoukaku/Lavalink wrapper that owns playback, per-guild queues, and track resolution.

## Ownership

- `index.js` — public surface: re-exports `MusicPlayer`, `QueueManager` (+ `LOOP_OFF`/`LOOP_TRACK`/`LOOP_QUEUE`), `resolveTrack`, `createTrackResolver`
- `player.js` — `MusicPlayer`: per-guild player lifecycle, connection, playback state, disconnect
- `queue.js` — `QueueManager`: queue data structure and loop modes
- `resolver.js` — track resolution: source priority order, direct-link vs Spotify metadata vs YouTube search fallback, best-match ranking

## Local Contracts

- `MusicPlayer.enqueue()` and `MusicPlayer.enqueueFront()` take the SAME options object (`{ guildId, track, textChannel, voiceChannel }`). A positional signature on one and an object on the other silently keys player state on the argument object and enqueues nothing.
- Both enqueue paths must start playback when the guild is idle, normalise absent `requestedByUserId`/`requestedByName` to `null`, and persist guild state.
- `MusicPlayer.restoreSession({ guildId, currentTrack, queue, textChannel, voiceChannel })` is the only supported way to rebuild playback from a snapshot. It preserves queue order; replaying `enqueueFront` per item reverses the queue because `enqueueFront` unshifts.
- The three teardown paths are distinct and must stay that way:
  - `disconnect(guildId)` is recoverable: flushes a snapshot, leaves voice, keeps the queue, records no tombstone
  - `stop(guildId)` is destructive: clears in place, leaves voice, records a tombstone. Never route it through `disconnect()`, which would re-persist the session it is clearing
  - `shutdown()` disconnects every guild recoverably so a redeploy resumes
  `leaveVoiceOnly()` removes transport only and keeps the in-memory queue.
- `restoreSessions({ client })` hydrates persisted sessions into logical state without touching voice; `reattachRestored()` resumes the restored current track once Lavalink is connected. Reattach must not call `playNext`, which shifts from the queue and would skip the current track.
- Channels are persisted as ids and resolved from `client.channels.cache` at restore time. A channel that no longer exists must not discard the restored queue.
- `persistGuildState()` stamps `updatedAt` from a monotonic per-guild counter, never a wall clock, so racing persists stay ordered. It swallows `StaleRevisionError` at debug level because fire-and-forget callers cannot handle it.

- External code (commands, events) interacts only through `client.musicPlayer` and the re-exports of `music/index.js`; no other module touches Shoukaku players directly.
- Players are keyed by guildId; `disconnect(guildId)` is the shutdown path used by `src/index.js`.
- Resolution honors per-guild `sourcePriority` from guild settings; fallback chain must never fail hard when Spotify resolution fails.
- Best-match scoring is deterministic and lives with resolution (`resolver.js` + `utils/tracks.js`), not in commands.
- Loop modes are stable constants exported from `queue.js`.

## Work Guidance

- New music modules should be re-exported through `music/index.js` so the public surface stays explicit.
- Keep scoring/ranking logic deterministic so it can be unit-tested.

- Every timer `MusicPlayer` starts (now-playing refresh re-arms, sleep timer) is registered with `this.timers`, a `TimerRegistry` from `utils/timer-registry.js`. Never add a bare `setTimeout` here: the refresh chain re-arms itself from its own callback, so an untracked timer cannot be stopped once its guild state is gone. `shutdown()` disposes the registry and returns `timersReleased`.

- `persistGuildState()` must never reject. It is called with `void` from nine queue paths, so any rejection becomes an unhandled rejection and Node 20 terminates the process. A disk failure (an unwritable or read-only data directory) costs a session snapshot, not playback.
- Persistence failures are reported with the fixed codes `session_persist_failed` / `session_persist_recovered`, once per outage per guild. Never re-log on every call: this runs on every queue mutation.

## Verification

- `test/music-player.test.js` — player lifecycle/queue behavior with stubbed Shoukaku
- `test/autoplay.test.js` — autoplay behavior
- `test/track-scoring.test.js` — best-match ranking
- `test/persist-failure-resilience.test.js` — a read-only data directory must not crash the player; failures log once per outage, not per event. This is the regression guard for the `void` call sites.
- `test/timer-ownership.test.js` — every timer the player starts is released by `dispose()`
- All run via `npm test`.

## Child DOX Index

- None (flat file set).
