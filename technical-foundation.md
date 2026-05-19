# Auralyn — Technical Foundation

This document captures the architecture, conventions, and constraints a future agent must follow when working on this project.

---

## Project Identity

Auralyn is a production-ready Discord music bot that embeds Lavalink v4 within the same container. It uses **Shoukaku** (not discord-player) as the Lavalink WebSocket client.

---

## Hard Constraints (never violate)

| Constraint | Reason |
|---|---|
| ES modules only (`import`/`export`, zero `require()`) | Build & runtime assumption |
| No new npm dependencies | Must stay lean; only `discord.js ^14.16.0`, `shoukaku ^4.3.0`, `dotenv ^16.4.0`, Node built-ins |
| Do not touch `Dockerfile`, `docker-compose.yml`, `lavalink/*`, `scripts/*`, `egg/*`, `package-lock.json` | Infrastructure is owned by ops |
| Intents: only `Guilds` + `GuildVoiceStates` | Avoids privileged intents |
| Every new command must `deferReply()` first | 3-second interaction timeout |
| Every command must wrap logic in `try/catch` with `editReply()` fallback | Prevent silent failures |
| Preserve all existing command behaviour | `/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/volume`, `/nowplaying`, `/loop`, `/queue`, `/shuffle`, `/remove`, `/ping`, `/help`, `/invite` |

---

## System Architecture

```
Discord Client ←→ Auralyn Bot (Node.js) ←→ Lavalink Server (Java, embedded)
                                            ↓
                                     Local File System
                                     (/app/data/, /app/logs/)
```

- **discord.js v14**: interaction handling, voice state events
- **Shoukaku v4**: WebSocket bridge to Lavalink
- **Lavalink v4**: audio decoding, streaming, YouTube/Spotify/SoundCloud resolution
- **No external services**: Lavalink runs on `127.0.0.1:2333` inside the container

---

## File Structure

```
src/
├── index.js                    # Entry point, wires everything
├── config.js                   # Env var loading + feature flags
├── commands/                   # 24 slash commands (dynamic-loaded)
│   ├── 247.js, autoplay.js, clear.js, filter.js
│   ├── help.js, invite.js, loop.js, lyrics.js
│   ├── nowplaying.js, pause.js, ping.js, play.js
│   ├── playnext.js, previous.js, queue.js, remove.js
│   ├── resume.js, search.js, seek.js, shuffle.js
│   ├── skip.js, skipto.js, stop.js, volume.js
├── events/
│   ├── interactionCreate.js    # Command dispatch + button handlers
│   └── voiceStateUpdate.js     # Auto-disconnect + 24/7 guard
├── music/
│   ├── index.js                # Facade exports
│   ├── player.js               # MusicPlayer class (playback logic)
│   ├── queue.js                # QueueManager (queue state + history)
│   └── resolver.js             # Re-exports from tracks.js
└── utils/
    ├── deploy-commands.js       # REST command registration
    ├── embeds.js                # Embed builders + brand constants
    ├── formatters.js            # formatCount, formatLoopMode
    ├── guild-settings.js        # Persistent per-guild settings
    ├── logger.js                # Structured logger
    ├── music-ui.js              # UI helpers (replyWithPlayerSnapshot, etc.)
    ├── permissions.js           # Voice + DJ permission checks
    ├── rate-limiter.js          # Rate limiting for guild sync
    ├── session-store.js         # Queue snapshot persistence
    ├── telemetry.js             # Usage metrics tracking
    └── tracks.js                # Track resolution + metadata helpers
```

---

## Key Design Decisions

### 1. Shoukaku over discord-player
Shoukaku is a thin WebSocket client — we own the queue/state logic in `QueueManager` + `MusicPlayer`, giving full control.

### 2. Embedded Lavalink
Lavalink runs as a child Java process inside the container. No external service dependency.

### 3. Single-scope command deployment
Commands deploy to **one scope only**:
- `GUILD_ID` env set → guild-scoped only (instant propagation)
- No `GUILD_ID` → global-scoped only (propagation up to 1 hour)

Never both — this prevents duplicate command registrations.

### 4. Persistent guild settings
Stored in `/app/data/guild-settings.json` as JSON. Synced on every `set` operation, loaded synchronously on module init. Fields:

| Field | Default | Description |
|---|---|---|
| `defaultVolume` | 100 | Volume on new session |
| `autoplay` | false | Auto-queue related tracks |
| `inactivityTimeoutMs` | 120000 | Auto-leave timeout |
| `djRoleIds` | [] | Role IDs with DJ permission |
| `sourcePriority` | ["direct","spotify","youtube"] | Track resolution order |
| `controlMode` | "public" | "public" or "requester_or_dj" |
| `twentyFourSeven` | false | Stay in VC when alone |
| `voteSkipEnabled` | false | Enable vote-skip |
| `voteSkipThreshold` | 50 | % of voice listeners needed to skip |

### 5. Player queue/history
- Queue per guild managed by `QueueManager`
- History array (max 10) — populated on track end / skip, consumed by `/previous`
- Vote-skip sets cleared on each track change

### 6. Autoplay
When queue is empty after track end and `autoplay` is enabled, the player resolves a related track via `trackResolver` using the previous track's artist + title as query.

### 7. 24/7 mode
When enabled, the bot skips the 2-minute auto-disconnect timeout when alone in a voice channel.

### 8. Vote-skip
When `voteSkipEnabled` and `voteSkipThreshold`% of non-bot voice members vote, `/skip` executes. Users with `ManageMessages` bypass voting.

---

## All 24 Commands

### Music Playback
| Command | Description |
|---|---|
| `/play <query>` | Play or queue a track |
| `/playnext <query>` | Queue at front |
| `/skip` | Skip (vote-skip if enabled) |
| `/skipto <position>` | Skip to queue position |
| `/previous` | Play from history |
| `/stop` | Stop + clear + disconnect |
| `/pause` | Pause |
| `/resume` | Resume |
| `/volume <1-100>` | Set volume |
| `/nowplaying` | Show current track |
| `/loop <off|track|queue>` | Set loop mode |
| `/seek <seconds>` | Seek to position |

### Queue Management
| Command | Description |
|---|---|
| `/queue` | Show queue |
| `/shuffle` | Shuffle |
| `/remove <position>` | Remove by position |
| `/clear` | Clear queue (keep current) |
| `/search <query>` | Interactive search with buttons |

### Audio & Filters
| Command | Description |
|---|---|
| `/filter <preset>` | Apply DSP preset (8 choices) |
| `/lyrics [query]` | Fetch lyrics via LRClib |

### Session Settings
| Command | Description |
|---|---|
| `/autoplay <enabled>` | Toggle autoplay |
| `/247 <enabled>` | Toggle 24/7 mode |

### Utilities
| Command | Description |
|---|---|
| `/ping` | Latency check |
| `/invite` | Invite link |
| `/help` | Command list |

---

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `DISCORD_TOKEN` | Yes | — |
| `CLIENT_ID` | Yes | — |
| `GUILD_ID` | No | — |
| `LAVALINK_PASSWORD` | Yes | `youshallnotpass` |
| `LAVALINK_HOST` | No | `127.0.0.1` |
| `LAVALINK_PORT` | No | `2333` |
| `LAVALINK_SECURE` | No | `false` |
| `LAVALINK_MEMORY` | No | `1G` |
| `LAVALINK_STARTUP_TIMEOUT` | No | `60` |
| `LOG_LEVEL` | No | `info` |
| `AUTO_SYNC_GLOBAL_COMMANDS` | No | `true` |
| `AUTO_SYNC_GUILD_COMMANDS` | No | `true` |
| `ENABLE_DEBUG_COMMANDS` | No | `false` |
| `STRICT_DJ_MODE` | No | `false` |
| `SPOTIFY_CLIENT_ID` | No | — |
| `SPOTIFY_CLIENT_SECRET` | No | — |

---

## Running / Building

```bash
# Development
npm install
cp .env.example .env          # fill in DISCORD_TOKEN + CLIENT_ID
npm start

# Production (Docker)
docker build -t auralyn:latest .
docker run -e DISCORD_TOKEN=... -e CLIENT_ID=... auralyn:latest
```

---

## Testing

```bash
npx mocha --timeout 30000
```

Tests live in `test/`. Core logic tests (queue, player, embed builders, deploy targets, permissions, guild settings) don't require a Discord connection.

---

## Invite Command Permissions

The `/invite` command constructs an OAuth2 URL with `permissions: 2150755648`, which maps to these 11 flags:

`View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Connect`, `Speak`, `Mute Members`, `Deafen Members`, `Move Members`, `Use Voice Activity`, `Priority Speaker`

---

## Execution Notes for AI Agents

- Work in delivery order specified by a plan
- After session compaction, read this file + `todo` to resume
- Every commit must be atomic per logical change
- Verify with test runner before claiming completion
