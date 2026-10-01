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
- `MusicPlayer.disconnect()` is recoverable (flushes a snapshot); `MusicPlayer.stop()` is destructive (clears the queue and current track); `leaveVoiceOnly()` removes transport only. Do not route a destructive operation through `disconnect()`.


- External code (commands, events) interacts only through `client.musicPlayer` and the re-exports of `music/index.js`; no other module touches Shoukaku players directly.
- Players are keyed by guildId; `disconnect(guildId)` is the shutdown path used by `src/index.js`.
- Resolution honors per-guild `sourcePriority` from guild settings; fallback chain must never fail hard when Spotify resolution fails.
- Best-match scoring is deterministic and lives with resolution (`resolver.js` + `utils/tracks.js`), not in commands.
- Loop modes are stable constants exported from `queue.js`.

## Work Guidance

- New music modules should be re-exported through `music/index.js` so the public surface stays explicit.
- Keep scoring/ranking logic deterministic so it can be unit-tested.

## Verification

- `test/music-player.test.js` — player lifecycle/queue behavior with stubbed Shoukaku
- `test/autoplay.test.js` — autoplay behavior
- `test/track-scoring.test.js` — best-match ranking
- All run via `npm test`.

## Child DOX Index

- None (flat file set).
