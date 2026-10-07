# lavalink — Bundled Lavalink Server

## Purpose

The pinned Lavalink v4 server that Auralyn ships and supervises inside the container.

## Ownership

- `Lavalink.jar` — pinned v4 binary; must stay compatible with the Shoukaku version in `package.json` (`^4.3.0`) and the API used by `src/music/`
- `application.yml` — server config (address/port, password, sources, plugins, audio tuning)
- `start.sh` — in-directory launcher with JVM tuning and readiness wait
- `application.yml` also owns the plugin dependency list, which must stay in sync with the `Dockerfile` plugin pins

## Local Contracts

- Server binds `127.0.0.1:2333`; password comes from `${LAVALINK_PASSWORD}`.
- Sources: youtube native disabled, soundcloud/twitch/bandcamp/http/local enabled; `lapix` plugin enabled. YouTube playback flows through the bot's resolve path.
- `lavalink.server.sources.youtube: false` is load-bearing, not cosmetic. That flag enables Lavalink's LEGACY built-in YouTube source (`lavaplayer.source.youtube`), which is unmaintained and fails with "must find sig function" / "must find action functions". When it is enabled, Lavalink resolves through the dead source instead of the plugin and every track dies. Leave it disabled and let `plugins.youtube.enabled: true` own YouTube.
- Audio tuning constants (documented in-file): `bufferDurationMs: 600`, `frameBufferDurationMs: 15000`, `opusEncodingQuality: 10`, `resamplingQuality: HIGH` — quality-over-latency tradeoffs chosen for Discord delivery.
- `start.sh` JVM tuning (G1GC, 50ms GC pause target, 1G default heap) exists to avoid audio dropouts; keep rationale comments in sync.

## Work Guidance

- Audio tuning changes must explain the latency-vs-quality tradeoff in comments.
- Don't bump `Lavalink.jar` without validating against the Shoukaku API surface used by `src/music/player.js`.

- The `Dockerfile` pins `YOUTUBE_PLUGIN_VERSION` and `LAVASRC_PLUGIN_VERSION`, and the plugin URLs must interpolate the `ARG` so the pin is the single source of truth. Never hardcode a literal version in a download URL.
- **The declared dependency version in `application.yml` MUST equal the version the image ships.** Lavalink compares `lavalink.plugins[].dependency` against the jar it finds in `./plugins`; on a mismatch `PluginManager` deletes the jar and downloads the declared one, which throws from its constructor under a read-only rootfs and takes the whole server down (`RuntimeException: Failed to delete ./plugins/...`). `test/lavalink-plugin-versions.test.js` enforces this across both files.
- **Bumping the plugin version does NOT restore playback.** An earlier revision of this doc claimed it did; that was inferred from a boot announcement, never verified, and is false. Every published version was measured against a real Lavalink and all failed. Do not repeat that inference. See `docs/playback-canary.md` for what was measured and why.

## Verification

- `test/lavalink-plugin-versions.test.js` — asserts the Dockerfile pin and the `application.yml` dependency agree, that neither uses a literal version, and that no test claims a version is known good.
- Startup is verified live, not hermetically: readiness probe `GET /v4/info` with an auth header from `scripts/start.sh` and `lavalink/start.sh`.
- YouTube playback has no hermetic test and cannot have one; it is probed against a real Lavalink. `docs/playback-canary.md` records the last measurement and the current upstream blocker. Re-run the canary before changing the plugin pin.

## Child DOX Index

- None (flat file set).
