# src/utils — Shared Utilities & Stores

## Purpose

Shared helpers, JSON persistence stores, and external integrations used across the bot.

## Ownership

- Stores: `guild-settings.js`, `playlist-store.js`, `liked-store.js`, `session-store.js`, `data-dir.js`
- Integrations: `spotify-resolver.js`, `spotify-check.js`, `spotify-yt-cache.js`, `tracks.js`, `deploy-commands.js`
- Presentation/parsing: `embeds.js`, `music-ui.js`, `formatters.js`, `time-parser.js`, `audio-filters.js`
- Cross-cutting: `logger.js`, `permissions.js`, `telemetry.js`, `rate-limiter.js`

## Local Contracts

- Stores persist JSON under `dataPath()` (default `/app/data`); all path logic lives in `data-dir.js` — never hardcode paths elsewhere.
- Never persist with bare `writeFile`. Use `writeJsonAtomic()` from `atomic-json.js`: it writes a unique sibling temp file, fsyncs, renames, and fsyncs the directory, so a reader never observes a partial file and a failure leaves the previous file intact.
- Never parse a persisted file inline. Use `readJsonWithQuarantine()`, which moves unparseable content to `<name>.corrupt-<ts>` and returns `null` so one bad file cannot block startup for every guild.
- Any read-modify-write of a store MUST go through `withFileLock()` from `storage-lock.js` and re-read the canonical file inside the lock. Writing a cached view erases another writer's entries. `withPathQueue` serialises in-process; the on-disk lock covers other processes.
- `GuildSettingsStore` writes one file per guild under `guilds/<id>/settings.json`. Passing `filePath` selects the legacy single-file map, which is test-only and is also the migration source. Always construct without arguments in production.
- `JsonSessionStore` persists `{ sessions: { [guildId]: envelope }, stopped: { [guildId]: iso } }`. Every envelope carries a store-assigned `revision`; a write whose `updatedAt` predates what is stored throws `StaleRevisionError`. `delete()` is a destructive stop and records a tombstone, which `save()` clears.
- Sessions are read from disk on every `get()`. Never serve them from a cached view: another shard's writes are invisible to a cache.
- `migrateLegacySettings()` and `migrateLegacySessions()` run once at startup. Both are idempotent, never delete their source, and never overwrite an existing canonical value.
- A held lock is heartbeated, so only an abandoned lock ages out. Never raise `staleMs` above the heartbeat interval.
- `spotify-resolver.js` is the ONLY module that calls `spotify-url-info`; `tracks.js` is the public track-resolution API used by commands.
- `logger.js` is the single logging entry point (levels debug/info/warn/error, scoped children); nothing logs to console directly except its sink.
- `embeds.js` + `music-ui.js` define the shared visual style; commands reuse these builders.
- `deploy-commands.js` serves both the root `npm run deploy` script and the `guildCreate` sync path.
- `deploy-commands.js` keeps one deployed-command hash per target (`global:<clientId>`, `guild:<clientId>:<guildId>`); never share a single module-level hash across scopes or one scope will suppress the others.
- Deployment ownership is a runtime role, never a config coincidence. `isManagedChildProcess()` reads `SHARDING_MANAGER`, which discord.js injects into every managed child; `getCommandDeploymentTargets(config, { isManagedChild })` gives global scope only to the manager or a standalone process. Never decide scope from `GUILD_ID` alone — a child with GUILD_ID unset must still not target global. `resetDeploymentState()` exists for test isolation.
- Rate limits are handled by `deploy-retry.js` (`deployWithRetry`): retries only HTTP 429, honours `Retry-After`, otherwise backs off 1s then 2s, and gives up after two retries. The REST client is built with `retries: 0` and `rejectOnRateLimit: async () => true` because @discordjs/rest only throws when that callback is truthy.
- `interaction-ids.js` is the ONLY place that parses component custom IDs. Each family declares its head fields, optional variable-length field, and tail. Never split a custom ID by fixed index: a playlist name may contain `:`.
- Keep pure helpers (`formatters`, `time-parser`, `audio-filters`) free of dependencies for easy unit testing.

## Work Guidance

- New cross-command behavior belongs here, not duplicated across command files.
- Cache writes (spotify-yt-cache) must be flushed on shutdown (handled by `src/index.js`).

## Verification

- `npm test` (`node --test`). Storage: `test/storage-primitives.test.js`, `test/storage-lock.test.js`, `test/storage-contention.test.js`, `test/guild-settings-store.test.js`, `test/session-envelope.test.js`, `test/session-tombstone.test.js`, `test/store-migration.test.js`, `test/legacy-migration-e2e.test.js`. Deployment: `test/deployment-ownership.test.js`, `test/command-deployment-state.test.js`. Other focused: `test/interaction-ids.test.js`, `test/deploy-retry.test.js`, `test/deploy-commands.test.js`, `test/command-deployment-state.test.js`, `test/settings-and-ops.test.js`, `test/static-contracts.test.js`.

## Child DOX Index

- None (flat file set).
