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
- `spotify-resolver.js` is the ONLY module that calls `spotify-url-info`; `tracks.js` is the public track-resolution API used by commands.
- `logger.js` is the single logging entry point (levels debug/info/warn/error, scoped children); nothing logs to console directly except its sink.
- `embeds.js` + `music-ui.js` define the shared visual style; commands reuse these builders.
- `deploy-commands.js` serves both the root `npm run deploy` script and the `guildCreate` sync path.
- `deploy-commands.js` keeps one deployed-command hash per target (`global:<clientId>`, `guild:<clientId>:<guildId>`); never share a single module-level hash across scopes or one scope will suppress the others. `resetDeploymentState()` exists for test isolation.
- Rate limits are handled by `deploy-retry.js` (`deployWithRetry`): retries only HTTP 429, honours `Retry-After`, otherwise backs off 1s then 2s, and gives up after two retries. The REST client is built with `retries: 0` and `rejectOnRateLimit: async () => true` because @discordjs/rest only throws when that callback is truthy.
- `interaction-ids.js` is the ONLY place that parses component custom IDs. Each family declares its head fields, optional variable-length field, and tail. Never split a custom ID by fixed index: a playlist name may contain `:`.
- Keep pure helpers (`formatters`, `time-parser`, `audio-filters`) free of dependencies for easy unit testing.

## Work Guidance

- New cross-command behavior belongs here, not duplicated across command files.
- Cache writes (spotify-yt-cache) must be flushed on shutdown (handled by `src/index.js`).

## Verification

- `npm test` (`node --test`). Focused: `test/interaction-ids.test.js`, `test/deploy-retry.test.js`, `test/deploy-commands.test.js`, `test/command-deployment-state.test.js`, `test/settings-and-ops.test.js`, `test/static-contracts.test.js`.

## Child DOX Index

- None (flat file set).
