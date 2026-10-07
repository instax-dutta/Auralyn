# lavalink — Bundled Lavalink Server

## Purpose

The pinned Lavalink v4 server that Auralyn ships and supervises inside the container.

## Ownership

- `Lavalink.jar` — pinned v4 binary; must stay compatible with the Shoukaku version in `package.json` (`^4.3.0`) and the API used by `src/music/`
- `application.yml` — server config (address/port, password, sources, plugins, audio tuning)
- `start.sh` — in-directory launcher with JVM tuning and readiness wait

## Local Contracts

- Server binds `127.0.0.1:2333`; password comes from `${LAVALINK_PASSWORD}`.
- Sources: youtube native disabled, soundcloud/twitch/bandcamp/http/local enabled; `lapix` plugin enabled. YouTube playback flows through the bot's resolve path.
- Audio tuning constants (documented in-file): `bufferDurationMs: 600`, `frameBufferDurationMs: 15000`, `opusEncodingQuality: 10`, `resamplingQuality: HIGH` — quality-over-latency tradeoffs chosen for Discord delivery.
- `start.sh` JVM tuning (G1GC, 50ms GC pause target, 1G default heap) exists to avoid audio dropouts; keep rationale comments in sync.

## Work Guidance

- Audio tuning changes must explain the latency-vs-quality tradeoff in comments.
- Don't bump `Lavalink.jar` without validating against the Shoukaku API surface used by `src/music/player.js`.

- The `Dockerfile` pins `YOUTUBE_PLUGIN_VERSION` and `LAVASRC_PLUGIN_VERSION`. Bump `YOUTUBE_PLUGIN_VERSION` whenever Lavalink announces a newer version on boot: an outdated plugin fails YouTube signature extraction ("must find sig function") and every track dies with `AllClientsFailedException`, which looks like a bot bug but is not.
- The plugin URLs must interpolate the `ARG`, never a literal version, so the pin is the single source of truth.

## Verification

- Existing checks: `scripts/start.sh` and `lavalink/start.sh` readiness probe (`GET /v4/info` with auth header); no automated test suite.

## Child DOX Index

- None (flat file set).
