# src — Bot Core

## Purpose

Auralyn's bot process: entrypoints, environment config, wiring of commands/events/music/utils, and the client-level singleton stores.

## Ownership

- `index.js` — process bootstrap: client construction (intents, sharding), Shoukaku node, stores, command/event loaders, guildCreate command sync, graceful shutdown, exports `main()`, `client`, `shoukaku`
- `shard.js` — ShardingManager launcher (default container entrypoint via `scripts/start.sh`; override with `BOT_ENTRYPOINT`). Bootstrap only: construction, spawn, and signal registration sit behind an `isMainModule` guard so importing the file has no side effects. Both entrypoints get that guard from `utils/is-main-module.js`.
- `shard-manager.js` — `HyperscaleShardManager` and `readShardManagerConfig()`, importable without a gateway. The manager and logger are injectable so shutdown can be tested against fakes.
- `config.js` — `loadConfig()`: the single env parser; validates `DISCORD_TOKEN`, `CLIENT_ID`, `LAVALINK_PASSWORD` and maps all documented env vars
- `deploy-commands.js` — standalone command-deploy script (`npm run deploy`)

## Local Contracts

- ESM everywhere; relative imports must include the `.js` extension (no extension-less imports).
- Never read `process.env` outside `config.js`; consume `client.config` (or `loadConfig()`) instead.
- Command module contract (loaded from `commands/`): default export with `data` (SlashCommandBuilder) and `execute(interaction, client, shoukaku)`; loader throws if either is missing.
- Event module contract (loaded from `events/`): default export with `name`, optional `once`, and `execute(...args, client, shoukaku)`; the loader owns listener registration.
- Sharding: when launched via the manager, `SHARDS` and `SHARD_COUNT` envs are injected; the Client must be constructed with explicit `shards`/`shardCount` so it always agrees with the manager.
- Shard shutdown is never force-killed. `gracefulShutdown()` sets `respawn = false` first, sends `{ op: 'graceful_shutdown' }`, and waits for each shard's `death` event. A child that does not exit is reported and sets `process.exitCode = 1`, never killed.
- Every timer the manager owns is registered and disposed on both the success and timeout paths, and `unref()`ed.
- Graceful shutdown: SIGINT/SIGTERM or the manager's typed IPC message `{ op: 'graceful_shutdown' }` → disconnect all players per guild, flush Spotify→YT cache, destroy client, exit 0.
- Shutdown is single flight. `shutdown()` memoizes its in-flight promise, so a later trigger returns the same teardown. `process.once` dedupes a repeated SIGINT/SIGTERM but not a signal and a typed IPC message arriving together, and the IPC handler uses `process.on`; without the guard the teardown runs twice and the first `process.exit(0)` truncates the second's writes. Unknown messages are ignored: `{ op: 'graceful_shutdown' }` is the only message that acts.
- The `process.on('message')` listener is registered only when `typeof process.send === 'function'`, i.e. only in a genuinely forked child. A normal import of `src/index.js` must attach no IPC listener; otherwise importing it in a test or tool captures process messages.
- Guild command sync is rate-limited (`guildSyncLimiter`: 3s window, burst 3) to stay inside Discord API limits.
- Singletons attached to client: `logger`, `config`, `telemetry`, `settingsStore`, `sessionStore`, `playlistStore`, `likedStore`, `musicPlayer`, `shardInfo`.
- `client.timerRegistry` is created by the `ready` handler and holds the timers it starts (e.g. the presence interval). `shutdown()` disposes it so no handler timer outlives the client.

## Work Guidance

- Keep core wiring minimal; domain logic belongs in `music/` and `utils/`.
- Logging only via `createLogger` from `utils/logger.js`; use `logger.child(scope)` for scoped output.
- All persisted runtime state must go through `utils/data-dir.js`; never hardcode paths. The root is `process.env.DATA_DIR ?? '/app/data'`, but `scripts/start.sh` may have resolved and exported a different writable `DATA_DIR` before this process started, so never assume the literal `/app/data` at runtime.

## Verification

- `npm test` (`node --test`) must pass. Sharding: `test/shard-manager.test.js` and `test/shard-import.test.js` drive shutdown from a child process, because a correct shutdown may call `process.exit`. `commands-load.test.js` exercises the command loader contract; `shard-ipc.test.js` forks `test/helpers/shard-child.js` and asserts the typed shutdown message makes the child exit 0.
- `loadConfig()` behavior is covered by tests and fails fast with clear errors on missing required env.
- Single-flight shutdown: `test/shard-ipc.test.js` calls the exported `shutdown()` twice concurrently from a forked helper and asserts both receive the same promise; the same suite sends an unknown and a malformed message and asserts the child ignores them and still honours a real `graceful_shutdown`.
- The entrypoint guard: `test/is-main-module.test.js`, including paths containing `#` and `%` that break naive `file://${argv[1]}` concatenation.

## Child DOX Index

- `commands/AGENTS.md` — slash command implementations
- `events/AGENTS.md` — Discord gateway event handlers
- `music/AGENTS.md` — playback engine (player, queue, resolver)
- `utils/AGENTS.md` — shared utilities, stores, integrations
