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
- Keep pure helpers (`formatters`, `time-parser`, `audio-filters`) free of dependencies for easy unit testing.

## Work Guidance

- New cross-command behavior belongs here, not duplicated across command files.
- Cache writes (spotify-yt-cache) must be flushed on shutdown (handled by `src/index.js`).

## Verification

- `test/audio-filters.test.js`, `test/time-parser.test.js`, `test/ui-and-logging.test.js`, `test/settings-and-ops.test.js`, `test/deploy-commands.test.js` — all via `npm test`.

## Child DOX Index

- None (flat file set).
