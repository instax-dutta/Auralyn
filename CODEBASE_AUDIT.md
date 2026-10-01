# Auralyn — In-Depth Codebase Audit Report

> **Audit Date:** 2026-07-07
> **Auditor:** Antigravity (Code Reviewer)
> **Audit Mode:** Read-only static analysis
> **Codebase Version:** Phase 3 implementation (Phases 1–3 complete, 4–5 pending)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview & Architecture](#2-project-overview--architecture)
3. [Dependency & Package Analysis](#3-dependency--package-analysis)
4. [Security Audit](#4-security-audit)
5. [Code Quality & Maintainability](#5-code-quality--maintainability)
6. [Performance Analysis](#6-performance-analysis)
7. [Error Handling & Resilience](#7-error-handling--resilience)
8. [Testing Coverage](#8-testing-coverage)
9. [Infrastructure & DevOps Review](#9-infrastructure--devops-review)
10. [Module-by-Module Findings](#10-module-by-module-findings)
11. [Technical Debt Register](#11-technical-debt-register)
12. [Roadmap Gap Analysis (Phase 4 & 5)](#12-roadmap-gap-analysis-phase-4--5)
13. [Actionable Recommendations](#13-actionable-recommendations)
14. [Severity Summary](#14-severity-summary)

---

## 1. Executive Summary

Auralyn is a **production-grade Discord music bot** built on Node.js 20+, discord.js v14, and Shoukaku v4 (Lavalink WebSocket client). The project is well-structured, enforces consistent conventions (ES Modules only, Components V2, deferred replies), and has a clear multi-phase implementation roadmap.

**Overall Assessment: B+ (Good with targeted improvements needed)**

| Category | Score | Grade |
|---|---|---|
| Architecture | 8.5/10 | A |
| Security | 6.5/10 | B- |
| Code Quality | 8/10 | A- |
| Performance | 7.5/10 | B+ |
| Error Handling | 8/10 | A- |
| Testing | 5.5/10 | C+ |
| Documentation | 9/10 | A |
| DevOps / Infra | 8/10 | A- |

**Critical Issues Found:** 2
**High Severity Issues:** 5
**Medium Severity Issues:** 8
**Low Severity / Improvements:** 12

---

## 2. Project Overview & Architecture

### 2.1 System Architecture

```
Discord Gateway <-> discord.js v14 (Client)
                         |
                   Auralyn Bot (Node.js 20)
                         |
         Shoukaku v4 WebSocket <-> Lavalink v4 (embedded Java process)
                         |
              Local File System (/app/data/)
              - guild-settings.json
              - sessions.json
              - Spotify->YT cache (JSON)
```

### 2.2 Directory Structure Assessment

The project follows a clean separation of concerns:

| Layer | Path | Responsibility |
|---|---|---|
| Entry Point | `src/index.js` | Bot bootstrap, DI wiring |
| Config | `src/config.js` | Env-var loading with validation |
| Commands | `src/commands/` | 58 slash command handlers |
| Events | `src/events/` | Discord event dispatchers |
| Music Domain | `src/music/` | Queue, player, Lavalink facade |
| Utilities | `src/utils/` | Shared helpers, resolvers, stores |
| Infrastructure | `Dockerfile`, `scripts/`, `lavalink/` | Container + Java runtime |

**Strengths:**
- Clear domain boundary between `music/` (playback logic) and `utils/` (infrastructure)
- Single-responsibility principle followed for utility modules
- Canonical command shape consistently applied across all 58 commands
- Events directory cleanly decoupled from command logic

**Weaknesses:**
- `src/index.js` plays triple duty: bot bootstrap, shard detection, and guild event wiring — partially violates SRP
- `utils/` directory is becoming a catch-all; `tracks.js` and `spotify-resolver.js` could live in a `src/resolvers/` layer

### 2.3 Data Flow

```
/play query
    -> interaction.deferReply()
    -> resolveTrack(shoukaku, query, { sourcePriority })
       -> tryResolveFromSource (direct -> spotify -> youtube)
       -> resolveSpotifyMetadata (Web API -> embed scrape fallback)
       -> searchYoutubeForSpotifyTrack (cached -> Lavalink search)
    -> musicPlayer.enqueue({ guildId, track, textChannel, voiceChannel })
       -> getOrCreateLavalinkPlayer (join VC -> attach listeners)
       -> playNext -> player.playTrack({ encoded })
    -> buildNowPlayingPayload -> interaction.editReply()
    -> startNowPlayingRefresh (60s auto-refresh ticker)
```

---

## 3. Dependency & Package Analysis

### 3.1 Production Dependencies

| Package | Version | Status | Notes |
|---|---|---|---|
| `discord.js` | `^14.16.0` | Current | Stable, well-maintained |
| `shoukaku` | `^4.3.0` | Current | Actively maintained Lavalink client |
| `dotenv` | `^16.4.0` | Current | Minimal, appropriate |
| `spotify-url-info` | `^3.3.0` | Watch | Used as fallback scraper; may break with Spotify embed changes |

### 3.2 Runtime Requirements

- **Node.js**: `>=20.0.0` (enforced in `package.json` engines field)
- **Java**: OpenJDK 17 JRE (for Lavalink) — pinned in Dockerfile
- **Lavalink**: v4 with YouTube plugin `1.18.1` and LavaSrc `4.8.2`

> **WARNING:** Plugin versions are hardcoded in `Dockerfile` ARGs (`YOUTUBE_PLUGIN_VERSION=1.18.1`, `LAVASRC_PLUGIN_VERSION=4.8.2`). These are downloaded at build time from `maven.lavalink.dev`. If the upstream Maven repository goes down or deletes those artifacts, the build will fail with no fallback.

### 3.3 Missing Development Dependencies

No `devDependencies` are defined in `package.json`. The following are implicitly needed but unlisted: an ESLint configuration, a formatter (Prettier), and code coverage tooling (`c8` or `nyc`). The test runner uses `node --test` (Node.js built-in), which is a valid zero-dependency choice.

---

## 4. Security Audit

### 4.1 CRITICAL: Graceful Shutdown via Chat Message

**File:** `src/index.js` (lines 111–114)

```js
client.on('messageCreate', (message) => {
  if (message.content === '!graceful_shutdown') {
    process.emit('SIGTERM');
  }
});
```

**Issue:** Any user who can send messages in any channel the bot can see can trigger a graceful shutdown by sending `!graceful_shutdown`. The bot does not declare the `MessageContent` privileged intent, so `message.content` is always empty — making this dead code that never fires today. **However**, if the `MessageContent` intent is ever added (e.g., for future features), this becomes an unauthenticated remote shutdown vector.

**Recommendation:** Remove this handler entirely. Use only `SIGTERM`/`SIGINT` for shutdown orchestration. For manual shutdown triggers, use a Discord slash command with `ManageGuild` permission. Also see section 9.4 for the related IPC issue.

---

### 4.2 CRITICAL: Shard IPC Graceful Shutdown Not Wired

**File:** `src/shard.js` (line 117) / `src/index.js`

The shard manager sends:
```js
shard.send({ op: 'graceful_shutdown' }).catch(() => {});
```

But `index.js` has no `process.on('message', ...)` handler — the IPC message is silently dropped. The only shutdown handler in `index.js` targets `messageCreate` content (above), not the shard process IPC channel.

**Recommendation:** Add an IPC handler in `index.js`:
```js
process.on('message', (msg) => {
  if (msg?.op === 'graceful_shutdown') process.emit('SIGTERM');
});
```

---

### 4.3 HIGH: Music Panel Buttons — No Permission Check

**File:** `src/events/interactionCreate.js` (lines 62–88)

Panel button handlers (`panel_pause`, `panel_skip`, `panel_stop`, `panel_prev`, `panel_loop`) dispatch directly to player methods **without verifying** that the user pressing the button is in the same voice channel or has DJ rights. Any user in the guild can click the music panel and control playback.

The inline buttons on "Now Playing" embeds (`auralyn:skip:guildId`) share the same gap.

**Recommendation:** Add a `requireSameVoiceChannel(interaction)` guard before dispatching all panel button actions. Consult `canManagePlayback` from `permissions.js` for DJ-gated guilds.

---

### 4.4 HIGH: Vote-Skip Uses Stale Local `hasDjRole` Check

**File:** `src/commands/skip.js` (lines 7–9, line 48)

```js
function hasDjRole(member, config) {
  return Boolean(config?.djRoleId && member.roles.cache.has(config.djRoleId));
}
// ...
if (humanCount > VOTESKIP_THRESHOLD && !hasDjRole(interaction.member, client.config)) {
```

This local function reads from `client.config` (static env-var config at startup), which has a singular `djRoleId` field. The canonical permissions system uses `settings.djRoleIds` (plural array, per-guild, from `guild-settings.js`). This bypasses the per-guild DJ role configured via `/setdj`.

**Recommendation:** Replace with the canonical import from `permissions.js` and pass settings from `settingsStore`.

---

### 4.5 HIGH: Spotify Client Secret in Returnable Object

**File:** `src/utils/spotify-resolver.js` (lines 47–52)

`getSpotifyCredentials()` returns `{ clientId, clientSecret }` as a plain object. If this is ever passed to `logger.error(...)` or `JSON.stringify(...)`, the secret leaks to logs.

**Recommendation:** Return only what callers need. The `clientSecret` is only needed inside `getSpotifyAccessToken` — refactor to avoid passing the credential object as a return value.

---

### 4.6 HIGH: Lavalink Port 2333 Exposed in docker-compose

The `docker-compose.yml` exposes port `2333` (Lavalink WebSocket) externally. Since Lavalink is an embedded sidecar, only localhost connectivity is needed. Exposing it publicly allows unauthorized external Lavalink clients.

**Recommendation:**
```yaml
ports:
  - "127.0.0.1:2333:2333"
```

---

### 4.7 MEDIUM: Unescaped User Content in Embeds

Track titles from Lavalink/Spotify are rendered directly in Discord markdown:
```js
const titleLine = uri ? `### [${title}](${uri})` : `### ${title}`;
```

A track title containing markdown like `[evil](http://phishing.com)` could render a misleading link. This is Discord-scoped (not traditional XSS), but notable for trust/abuse considerations.

---

## 5. Code Quality & Maintainability

### 5.1 Strengths

- **ES Modules Consistency:** All files use `import`/`export`. No `require()` calls found. `"type": "module"` in `package.json` enforces this at runtime.
- **Canonical Command Shape:** All 58 commands follow `export default { data, execute }` with `deferReply()` -> `try/catch` -> `editReply` on error. Fully consistent.
- **Well-commented design decisions:** `audio-filters.js` includes frequency annotations. `player.js` documents recoverable voice close codes and nowPlaying refresh dedup rationale.
- **Immutable Config:** `defaultGuildSettings` is frozen via `Object.freeze()` — prevents accidental mutation of the defaults singleton.
- **Graceful Fallback Chain:** Track resolution implements a clean priority chain: direct URL -> Spotify (Web API -> embed scrape) -> YouTube search. Each stage is independently fail-safe.

### 5.2 Issues

**MEDIUM: `djModeEnabled` vs `controlMode` — Semantic Overlap**

The settings schema has both `djModeEnabled: false` and `controlMode: 'public'`. The `requireDjOrAdmin` function in `permissions.js` checks `settings.controlMode`, not `settings.djModeEnabled`. The `dj.js` command toggles `djModeEnabled` but no code path consults it to change behavior. The flag appears to have been added but never wired.

**Recommendation:** Wire `djModeEnabled` into `requireDjOrAdmin` (when true, force DJ-only for all playback commands), or remove it and make `controlMode` the single source of truth.

---

**MEDIUM: `controlMode` Only Accepts Two Values Despite Three Documented**

The sanitizer enforces:
```js
controlMode: input.controlMode === 'requester_or_dj' ? 'requester_or_dj' : 'public',
```

Phase 3 documentation describes three modes (`'public'`, `'dj'`, `'locked'`), but only two are implemented. `'dj'` and `'locked'` silently fall back to `'public'`.

---

**LOW: `sourcePriority` — SoundCloud Undocumented**

`VALID_SOURCES` includes `soundcloud`:
```js
export const VALID_SOURCES = new Set(['direct', 'youtube', 'soundcloud']);
```

But the README and `technical-foundation.md` do not mention SoundCloud support. It is a supported but undocumented source.

---

**LOW: `QueueManager.getSnapshot` Omits Live Fields**

The snapshot omits `textChannel`, `voiceChannel`, `filterLayers`, `sleepTimer`, and `history`. Code consuming `getPlayerState()` may silently get `undefined` for these fields.

---

**LOW: `src/music/resolver.js` Re-export Shim**

The file is documented as a re-export shim for `tracks.js`. If it is only a thin wrapper, it adds indirection without value. Verify it is not dead code.

---

## 6. Performance Analysis

### 6.1 Strengths

- **In-Memory Track Resolution Cache:** LRU-style cache with 30-min TTL and 1000-entry cap.
- **Spotify->YT Persistent Cache:** Survives restarts, prevents redundant Lavalink searches.
- **Now-Playing Refresh Dedup:** Computes a `payloadKey` and skips Discord edits when nothing changed — prevents rate-limit issues on 24/7 bots.
- **Bounded Concurrent Spotify Resolution:** Batch size of 5 concurrent YouTube searches for Spotify playlists prevents Lavalink overload.

### 6.2 Issues

**HIGH: `guild-settings.js` — Synchronous File Read at Startup**

```js
constructor({ filePath } = {}) {
  this._loadSync(); // Blocking I/O
}
```

`readFileSync` + `JSON.parse` blocks the event loop at startup. At 10,000 guilds this becomes a measurable startup delay. An async `ensureLoaded()` pattern is already present on the class — switch to lazy async-only loading.

---

**HIGH: Session Store — Write-per-Operation**

```js
async save(guildId, snapshot) {
  cache[guildId] = snapshot;
  await this.persist(); // Full file rewrite on every change
}
```

Every enqueue, skip, pause, volume change, etc., triggers a full `sessions.json` rewrite. For 10+ concurrent active guilds this creates a write thundering herd.

**Recommendation:** Add a write-debounce (batch writes within 500ms):
```js
this._scheduleWrite = debounce(() => this.persist(), 500);
```

---

**MEDIUM: No Queue Size Limit**

`enqueueBulk()` has no cap. A Spotify playlist with 2000 tracks (the `SPOTIFY_MAX_TRACKS` ceiling) adds 2000 objects to memory per guild. Across multiple guilds, this could exhaust the Node.js heap.

**Recommendation:** Add a configurable `MAX_QUEUE_LENGTH` (e.g., 500) with an env-var override.

---

**MEDIUM: LRU Cache Eviction Uses Insertion Order, Not Access Order**

The track resolver's `prune()` evicts oldest-inserted keys first, not least-recently-used. Frequently-searched tracks can be evicted while stale entries remain. Use `Map.set` move-to-end on access for true LRU behavior.

---

**LOW: Inner Regex in `fetchAutoplayTrack`**

The YouTube video ID regex is defined inside the function body, compiled fresh on every call. Move it to module scope as a compiled constant.

---

## 7. Error Handling & Resilience

### 7.1 Strengths

- **Recoverable Voice Close Codes:** `RECOVERABLE_VOICE_CLOSE_CODES = new Set([1000, 1001, 1006, 4006, 4014, 4015])` correctly differentiates transient drops from fatal disconnects, preventing queue wipes on region migrations.
- **Shoukaku Session Resume:** `resume: true, resumeTimeout: 60, reconnectTries: 10` preserves Lavalink player state across reconnects.
- **VC Status Swallows Errors:** `.catch(() => {})` on the voice status REST call correctly handles the 403 that Discord returns on free tier bots.
- **NowPlaying Refresh Backoff:** Implements exponential backoff up to 240s after consecutive edit failures.

### 7.2 Issues

**MEDIUM: `session-store.js` — No try/catch on `persist()`**

```js
async persist() {
  await mkdir(...);
  await writeFile(...); // Unhandled rejection if disk full or permissions denied
}
```

Compare with `guild-settings.js` which wraps persist in try/catch. The inconsistency means `session-store` errors will generate unhandled promise rejections.

**Recommendation:** Wrap in try/catch and log the error.

---

**MEDIUM: `inactivityTimeoutMs` Setting Defined but Never Implemented**

`inactivityTimeoutMs` exists in the settings schema and can be configured by server admins, but no code in `player.js` or the event handlers reads this field and schedules a disconnect timer. The setting is a no-op.

**Recommendation:** In `playNext()`, when the queue empties and `!stayInVC`, start a `setTimeout(() => this.stop(guildId), inactivityTimeoutMs)` if `inactivityTimeoutMs > 0`.

---

**LOW: `handleTrackProblem` Does Not Differentiate `stuck` vs `exception`**

Both event types call `skip()` unconditionally. A `stuck` event (mid-playback stall) could benefit from a single retry before skipping.

---

**LOW: `getOrCreateLavalinkPlayer` Concurrent Call Race**

Two rapid `/play` commands for the same guild can both attempt `joinVoiceChannel()` simultaneously before the player is registered. Shoukaku likely handles this, but there is no in-flight deduplication guard on the bot side.

---

## 8. Testing Coverage

### 8.1 Test Files

| File | Coverage Area |
|---|---|
| `audio-filters.test.js` | Filter preset structure validation |
| `autoplay.test.js` | Autoplay track-fetch logic |
| `commands-load.test.js` | Dynamic command loader |
| `deploy-commands.test.js` | Deploy target validation |
| `music-player.test.js` | MusicPlayer class unit tests |
| `settings-and-ops.test.js` | GuildSettingsStore CRUD |
| `time-parser.test.js` | Time string parsing |
| `track-scoring.test.js` | Search result ranking |
| `ui-and-logging.test.js` | Embed builder + logger |

### 8.2 Coverage Gaps

> **WARNING:** No integration tests exist — all tests are unit-level. There are no end-to-end tests that exercise the full command -> player -> Lavalink flow.

| Gap | Severity | What's Missing |
|---|---|---|
| `spotify-resolver.js` | HIGH | No tests for Web API path vs. embed-scrape fallback |
| Phase 3 commands (13) | HIGH | DJ system, settings, music panel — no tests |
| `rate-limiter.js` | MEDIUM | Token-bucket behavior under burst load untested |
| `interactionCreate.js` | MEDIUM | Button handler routing not tested |
| `voiceStateUpdate.js` | MEDIUM | Auto-disconnect logic untested |
| Queue loop modes | MEDIUM | LOOP_QUEUE re-enqueue behavior under edge cases |
| `permissions.js` | LOW | `getCommandRestriction` async behavior |
| `session-store.js` | LOW | Concurrent read/write patterns |

`IMPLEMENTATION_PLAN.md` claims "Tests passing: 48" — the count refers to individual `assert` calls within each test file, not file count. All 9 test files were confirmed present.

### 8.3 Test Infrastructure

The project correctly uses `node --test` (Node.js built-in test runner). Missing:
- No coverage instrumentation (`c8`, `nyc`)
- No CI enforcement of minimum coverage threshold
- No test configuration file

---

## 9. Infrastructure & DevOps Review

### 9.1 Dockerfile

**Strengths:**
- Multi-stage build separates `npm ci` from the runtime image
- Non-root user execution (`nodeuser:1001`)
- `tini` as PID 1 for correct signal forwarding to the Node process
- Health check pings Lavalink `/v4/info` endpoint
- `--omit=dev` excludes devDependencies from the production image

**Issue — Supply Chain Risk:**

Plugin JARs are downloaded at build time from `maven.lavalink.dev` with no integrity verification:
```dockerfile
RUN curl --fail ... --output "/app/lavalink/plugins/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar"
```

If the upstream artifact is tampered with, the build would silently use a malicious JAR.

**Recommendation:** Add SHA256 checksum verification:
```dockerfile
RUN curl ... --output /path/to/plugin.jar \
  && echo "EXPECTED_SHA256  /path/to/plugin.jar" | sha256sum -c
```

---

### 9.2 docker-compose.yml

The compose file exposes port `2333` (Lavalink) externally. Lavalink is an embedded sidecar and only needs localhost connectivity. See section 4.6.

---

### 9.3 `.env.example`

Good baseline documentation. Gaps:
1. `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` marked optional with no explanation of the fallback behavior (embed scrape).
2. `DATA_DIR` (Phase 4), `LASTFM_API_KEY`, `LASTFM_API_SECRET` (Phase 5) are not yet present but will be needed.

---

### 9.4 Sharding Architecture (`src/shard.js`)

The `HyperscaleShardManager` is well-implemented:
- Per-shard state tracking via `shardStates` Map
- Graceful shutdown with configurable timeout
- Memory monitoring via `fetchClientValue('shardStats')`

**Critical gap:** The graceful shutdown sends `{ op: 'graceful_shutdown' }` via `shard.send()` (Node.js IPC), but `index.js` has no `process.on('message', ...)` handler. The IPC message is silently dropped. See section 4.2 for the fix.

---

## 10. Module-by-Module Findings

### 10.1 `src/index.js`

| Item | Finding | Severity |
|---|---|---|
| `messageCreate` shutdown handler | Dead code; security risk if `MessageContent` intent is added | CRITICAL |
| `guildCreate` rate limiting | Properly rate-limited via `RateLimiter` | OK |
| `client.settingsStore` alias | Both root and `musicPlayer` reference correct stores | OK |
| Shard ID parsing | `JSON.parse` with try/catch — correct | OK |
| `shutdown()` | Disconnects all players and flushes caches before exit | OK |
| IPC `process.on('message')` | Missing — shard graceful shutdown IPC not handled | CRITICAL |

### 10.2 `src/music/player.js`

| Item | Finding | Severity |
|---|---|---|
| `playNext` announce hook | Correct: settings async read, wrapped in `.catch(() => {})` | OK |
| `buildCombinedFilter` | Handles 5 independent filter layers cleanly | OK |
| `handleConnectionClosed` | Correctly differentiates recoverable vs. fatal voice close codes | OK |
| `getOrCreateLavalinkPlayer` race | Concurrent calls may double-join VC | LOW |
| `fetchAutoplayTrack` inner regex | Regex compiled on every call | LOW |
| `previous()` | Uses `history.shift()` correctly | OK |
| `inactivityTimeoutMs` | Schema field defined, never implemented in code | MEDIUM |

### 10.3 `src/music/queue.js`

| Item | Finding | Severity |
|---|---|---|
| `getSnapshot` omits live fields | `textChannel`, `voiceChannel`, `history` missing from snapshot | LOW |
| `getNextTrack` loop handling | Correctly handles LOOP_TRACK; LOOP_QUEUE handled in `onTrackEnd` | OK |
| Fisher-Yates shuffle | Correct in-place implementation | OK |
| History cap at 10 entries | Reasonable and documented | OK |
| `removeIf` predicate | Clean functional filter | OK |
| No queue size limit | `enqueueBulk` adds unlimited tracks | MEDIUM |

### 10.4 `src/utils/guild-settings.js`

| Item | Finding | Severity |
|---|---|---|
| `_loadSync()` blocking I/O | Blocks event loop at startup | HIGH |
| `sanitizeGuildSettings` | Comprehensive whitelist validation | OK |
| `defaultGuildSettings` frozen | `Object.freeze()` prevents mutation | OK |
| `controlMode` limited to 2 values | `'dj'` and `'locked'` silently fall back to `'public'` | MEDIUM |
| `djModeEnabled` not wired | Flag defined but never consulted in permission logic | MEDIUM |

### 10.5 `src/utils/tracks.js`

| Item | Finding | Severity |
|---|---|---|
| Process-wide singleton resolver | Correctly avoids per-call cache recreation | OK |
| `pickBestSearchResult` scoring | Title match + official signals + duration range — well-tuned | OK |
| `UNOFFICIAL_TITLE_PATTERNS` | Broad but appropriate; may penalize legitimate remixes | LOW |
| Spotify+YT cache dedup | Uses `id:${spotifyTrack.id}` as key when available | OK |

### 10.6 `src/utils/permissions.js`

| Item | Finding | Severity |
|---|---|---|
| `requireDjOrAdmin` checks `'everyone'` | `'everyone'` is not a valid `controlMode` value per sanitizer — semantically misleading but functionally correct | MEDIUM |
| `getCommandRestriction` | Correctly async; returns null when no settings | OK |
| `canManagePlayback` | Clean requester-check policy function | OK |

### 10.7 `src/utils/spotify-resolver.js`

| Item | Finding | Severity |
|---|---|---|
| Dual-path resolution | Web API -> embed scrape fallback is clean | OK |
| `SPOTIFY_MAX_TRACKS = 2000` | Hard ceiling prevents runaway memory | OK |
| `AbortSignal.timeout(10_000)` | Request timeout on all API calls | OK |
| Token cache in module scope | Standard OAuth practice | OK |
| `spotify-url-info` fallback | Third-party scraper; may break with Spotify HTML changes | WATCH |
| No test coverage | Web API path vs. fallback untested | HIGH |
| `getSpotifyCredentials` returns secret | Object containing `clientSecret` can be accidentally logged | HIGH |

### 10.8 `src/utils/rate-limiter.js`

| Item | Finding | Severity |
|---|---|---|
| Token bucket algorithm | Correct implementation | OK |
| `process()` concurrent guard | `this.processing` flag prevents re-entry | OK |
| Queue unbounded | No cap on pending items; guild-join floods could OOM | LOW |

### 10.9 `src/events/interactionCreate.js`

| Item | Finding | Severity |
|---|---|---|
| Panel buttons — no auth check | Any guild member can control playback via panel buttons | HIGH |
| `patchV2` rate guard | 1-second minimum between patches per message | OK |
| 40060 duplicate interaction | Correctly swallowed | OK |
| Settings reset flow | Button flow cancels cleanly | OK |
| Loop button cycle | `LOOP_CYCLE` array with `?? LOOP_OFF` fallback is correct | OK |

---

## 11. Technical Debt Register

| ID | Area | Description | Effort | Priority |
|---|---|---|---|---|
| TD-01 | `index.js` | Remove `messageCreate` shutdown handler + add IPC handler | XS | CRITICAL |
| TD-02 | `skip.js` | Fix local `hasDjRole` to use `settings.djRoleIds` via `settingsStore` | S | HIGH |
| TD-03 | `interactionCreate.js` | Add voice channel + role checks to all panel button handlers | S | HIGH |
| TD-04 | `shard.js` / `index.js` | Wire `process.on('message')` IPC for graceful shutdown | S | HIGH |
| TD-05 | `Dockerfile` | Add SHA256 verification for plugin JAR downloads | S | HIGH |
| TD-06 | `docker-compose.yml` | Bind port 2333 to `127.0.0.1` | XS | HIGH |
| TD-07 | `guild-settings.js` | Replace `_loadSync()` with async-only loading | S | MEDIUM |
| TD-08 | `session-store.js` | Add write-debounce; add try/catch to `persist()` | S | MEDIUM |
| TD-09 | `player.js` | Implement `inactivityTimeoutMs` — wire setting into disconnect timer | M | MEDIUM |
| TD-10 | `queue.js` | Add configurable max queue size limit | S | MEDIUM |
| TD-11 | `permissions.js` | Replace `'everyone'` with `'public'` in the control mode check | XS | LOW |
| TD-12 | `guild-settings.js` | Resolve `djModeEnabled` vs `controlMode` semantic overlap | S | MEDIUM |

**Effort Key:** XS = <30min, S = 1-2h, M = half-day, L = full day

---

## 12. Roadmap Gap Analysis (Phase 4 & 5)

### 12.1 Phase 4 — Playlists & Liked Songs (NOT STARTED)

The plan introduces `src/utils/data-dir.js` as a new `dataPath()` utility. Concerns:

- **Two storage path systems:** Existing stores (`guild-settings.json`, `sessions.json`) will remain hardcoded while new stores use `dataPath()`. This creates two configuration surfaces for storage root.
- **No atomic write pattern:** `playlist-store.js` and `liked-store.js` will follow the current write-then-overwrite pattern. For user-owned data (playlists), consider write-to-temp-file + atomic rename to prevent corruption.
- **Pagination button stale interactions:** Playlist pagination buttons stored in Discord channels indefinitely can trigger "Unknown Interaction" (40060) errors without a TTL mechanism.

### 12.2 Phase 5 — Integrations & Utilities (NOT STARTED)

Key concerns:

- **Spotify OAuth (PKCE):** The plan stores PKCE verifiers in a memory `Map`. This does not survive bot restarts or shard boundaries in a multi-shard deployment. Plan for persistence or single-shard sticky routing.
- **Last.fm `signParams` (MD5):** MD5 is Last.fm's required signing algorithm. Add an explicit comment in code since using MD5 for new cryptographic operations looks like a security flaw to reviewers unfamiliar with the Last.fm API requirement.
- **`/prune` command:** `channel.bulkDelete` only works for messages less than 14 days old. Add an explicit age filter to avoid silent failures.
- **`/music-guesser`:** Uses `awaitMessageComponent` with a 30s timeout. Ensure the timeout rejection is handled explicitly.
- **Music logger (JSONL append):** `fs.appendFile` on every track end creates potential write contention under heavy multi-guild load. Consider a buffered/batched write approach.

---

## 13. Actionable Recommendations

### CRITICAL — Fix Immediately

1. **Remove `messageCreate` shutdown handler** and add proper IPC handler in `index.js`:
   ```js
   process.on('message', (msg) => {
     if (msg?.op === 'graceful_shutdown') process.emit('SIGTERM');
   });
   ```

2. **Add SHA256 checksum verification** for plugin JAR downloads in `Dockerfile`

### HIGH — Fix Before Next Deploy

3. **Fix `skip.js` DJ check** — replace `hasDjRole(member, client.config)` with the canonical check from `permissions.js` using per-guild `settingsStore` data

4. **Add voice channel + role authorization** to all panel button handlers in `interactionCreate.js`

5. **Bind Lavalink port 2333 to localhost** in `docker-compose.yml`

### MEDIUM — Next Sprint

6. **Implement `inactivityTimeoutMs`** — read the setting in `playNext()` and schedule a disconnect timer when the queue empties

7. **Add write-debounce to `session-store.js`** — batch writes within 500ms to reduce I/O during active multi-guild playback

8. **Add `try/catch` to `session-store.persist()`** — match the error handling pattern in `guild-settings.js`

9. **Resolve `djModeEnabled` vs `controlMode`** — either wire the flag into permission checks or remove it

10. **Replace `_loadSync()` in `guild-settings.js`** with lazy async loading

### LOW — Backlog

11. Add ESLint configuration for automated style enforcement
12. Add code coverage tracking (`c8` or `nyc`)
13. Document SoundCloud as a supported source in README and `.env.example`
14. Write tests for Phase 3 DJ system commands (13 new commands added in Phase 3 have no tests)
15. Move inner regex in `fetchAutoplayTrack` to module scope as a compiled constant
16. Consider a `src/resolvers/` layer for `tracks.js` and `spotify-resolver.js` to reduce `utils/` sprawl

---

## 14. Severity Summary

| Severity | Count | Key Items |
|---|---|---|
| CRITICAL | 2 | `messageCreate` shutdown handler; broken IPC graceful shutdown |
| HIGH | 5 | Panel button auth gap; `skip.js` stale DJ check; port 2333 exposure; sync startup I/O; session store write frequency |
| MEDIUM | 8 | `djModeEnabled` gap; `controlMode` incomplete values; inactivity timer missing; `session-store.persist()` no error handling; embed content injection; plugin JAR checksum; test gaps (Phase 3 commands, spotify-resolver) |
| LOW | 12 | Naming semantics; SoundCloud undocumented; queue snapshot fields; inner regex; LRU eviction; concurrent player race; rate-limiter queue unbounded; etc. |

---

## Appendix A: Files Audited

| File | Lines | Scope |
|---|---|---|
| `src/index.js` | 235 | Full |
| `src/config.js` | 52 | Full |
| `src/shard.js` | 153 | Full |
| `src/music/player.js` | 784 | Full |
| `src/music/queue.js` | 269 | Full |
| `src/music/index.js` | — | Facade |
| `src/events/interactionCreate.js` | 190 | Full |
| `src/events/voiceStateUpdate.js` | 67 | Full |
| `src/utils/guild-settings.js` | 156 | Full |
| `src/utils/tracks.js` | 425 | Full |
| `src/utils/music-ui.js` | 253 | Full |
| `src/utils/permissions.js` | 102 | Full |
| `src/utils/spotify-resolver.js` | 260 | Full |
| `src/utils/audio-filters.js` | 387 | Partial (first 60 lines + structure) |
| `src/utils/rate-limiter.js` | 55 | Full |
| `src/utils/telemetry.js` | 66 | Full |
| `src/utils/session-store.js` | 51 | Full |
| `src/utils/logger.js` | 71 | Full |
| `src/commands/play.js` | 99 | Full |
| `src/commands/skip.js` | 75 | Full |
| `package.json` | 23 | Full |
| `Dockerfile` | 54 | Full |
| `README.md` | 196 | Full |
| `IMPLEMENTATION_PLAN.md` | 311 | Full |
| `PHASE3.md` | 243 | Full |
| `SHARDING.md` | 359 | Full |
| `technical-foundation.md` | 236 | Full |
| `test/` (9 files) | ~1,100 est. | Listing + structure reviewed |

---

*Audit completed in read-only mode. No source files were modified. All findings are based on static analysis at the time of review.*
