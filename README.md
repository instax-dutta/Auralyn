# Auralyn — Discord Music Bot

**Auralyn** is a branded fork of the Lavakit Discord music bot, enhanced for crystal-clear audio, seamless playback, fast queues, smart search, and smooth performance. It bundles an embedded Lavalink v4 server for a self-contained, single-container deployment on Pelican/Pterodactyl panels or any Docker host.

## Features

### Core Playback
- Discord.js v14 slash commands with rich embed UI
- High-fidelity audio via Lavalink v4 + YouTube plugin + lavasrc
- Full queue management with shuffle, remove, track/queue loop
- Automatic volume normalization per guild

### Smart Source Resolution
- **Configurable source priority** — per-guild ordered list (direct URL → Spotify → YouTube)
- **Quality-aware ranking** — search results scored by title match, duration, artwork, and author metadata; best result selected automatically
- **Priority fallback** — if a higher-priority source fails, the next source is tried before giving up
- **Source badges** — nowplaying embed shows which source resolved the track

### Operational
- **Feature flags** — `AUTO_SYNC_GLOBAL_COMMANDS`, `AUTO_SYNC_GUILD_COMMANDS`, `ENABLE_DEBUG_COMMANDS`, `STRICT_DJ_MODE` (env-configured)
- **Rate-limited guild sync** — command deployment on `guildCreate` is throttled (max 5 burst / 2s interval) to avoid API spam on mass join
- **Session telemetry** — tracks commands executed, tracks played, errors, voice connections, Lavalink reconnects; logged on startup
- **Permission policy helper** — `requireVoice`, `requireSameVoiceChannel`, `requireDjOrAdmin` — consistent, descriptive error replies
- **Domain-split architecture** — queue management (`QueueManager`), track resolution (`resolver.js`), and playback (`MusicPlayer`) separated into focused modules
- **DSP-minimal default** — flat EQ by default; filters are explicit opt-in only
- **Production logging** — Lavalink Spring Boot noise suppressed to WARN level; `gcWarnings` disabled

### UI & Commands
- Consistent embed styling with `buildActionFeedback`, `replyWithPlayerSnapshot`, `buildQueueReply`
- `/help` command with categorized command listing
- `/ping` with latency-aware color coding (via shared `buildPingEmbed`)
- `/nowplaying` with current track, source, volume, loop state, queue length, and interactive buttons
- Button controls (skip/pause/resume/stop) on all playback embeds
- Auto-leave on 2m voice channel inactivity

## Requirements

- Docker (recommended) or Node.js 18+ with Java 17 for local development

## Quick Start (Docker)

1. **Build the image:**
```bash
docker build -t auralyn .
```

2. **Run with environment variables:**
```bash
docker run -d \
  --name auralyn \
  -p 2333:2333 \
  -e DISCORD_TOKEN=your_token_here \
  -e CLIENT_ID=your_client_id \
  -e GUILD_ID=your_guild_id \
  -e LAVALINK_PASSWORD=your_password \
  auralyn
```

3. **Or use docker-compose:**
```bash
cp .env.docker .env
# Edit .env with your values
docker-compose up -d
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_TOKEN` | Discord bot token | — | Yes |
| `CLIENT_ID` | Discord application client ID | — | Yes |
| `GUILD_ID` | Guild ID for guild-command deployment | — | No |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` | No |
| `LAVALINK_HOST` | Lavalink server hostname | `127.0.0.1` | No |
| `LAVALINK_PORT` | Lavalink server port | `2333` | No |
| `LAVALINK_PASSWORD` | Lavalink server password | — | Yes |
| `LAVALINK_SECURE` | Use secure WebSocket (`true`/`false`) | `false` | No |
| `AUTO_SYNC_GLOBAL_COMMANDS` | Deploy global slash commands on startup | `true` | No |
| `AUTO_SYNC_GUILD_COMMANDS` | Deploy guild commands on `guildCreate` | `true` | No |
| `ENABLE_DEBUG_COMMANDS` | Enable debug-only commands (reserved) | `false` | No |
| `STRICT_DJ_MODE` | Require DJ role for playback controls | `false` | No |

## Commands

| Command | Description |
|---------|-------------|
| `/play` | Play a song or add to queue (URL or search term) |
| `/skip` | Skip the current track |
| `/stop` | Stop playback and clear the queue |
| `/pause` | Pause the current track |
| `/resume` | Resume playback |
| `/volume` | Set player volume (1–100) |
| `/nowplaying` | Show the currently playing track |
| `/loop` | Set loop mode (off / track / queue) |
| `/queue` | View the current music queue |
| `/shuffle` | Shuffle the queue |
| `/remove` | Remove a track from the queue by position |
| `/ping` | Check bot and WebSocket latency |
| `/help` | Show categorized command listing |

## Pelican/Pterodactyl Panel Deployment

### Option 1: Custom Docker Image

1. Build and push the image to your registry:
```bash
docker build -t ghcr.io/instax-dutta/auralyn:latest .
docker push ghcr.io/instax-dutta/auralyn:latest
```

2. In your panel, create a new egg with:
   - Image: `ghcr.io/instax-dutta/auralyn:latest`
   - Startup: `node src/index.js`
   - Memory: 2048 MB
   - CPU: 100%

3. Add environment variables: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `LAVALINK_PASSWORD`

### Option 2: From Source

1. Upload bot files to your server
2. `npm install`
3. Set environment variables
4. `node src/index.js`

## Project Structure

```
auralyn/
├── src/
│   ├── index.js              # Main entry point
│   ├── config.js              # Env-based configuration + feature flags
│   ├── commands/              # Slash command handlers
│   │   ├── help.js
│   │   ├── loop.js
│   │   ├── nowplaying.js
│   │   ├── pause.js
│   │   ├── ping.js
│   │   ├── play.js
│   │   ├── queue.js
│   │   ├── remove.js
│   │   ├── resume.js
│   │   ├── shuffle.js
│   │   ├── skip.js
│   │   ├── stop.js
│   │   └── volume.js
│   ├── events/               # Discord event handlers
│   │   ├── interactionCreate.js
│   │   ├── ready.js
│   │   └── voiceStateUpdate.js
│   ├── music/                # Music domain (split architecture)
│   │   ├── index.js          # Facade exports
│   │   ├── player.js         # Playback orchestration
│   │   ├── queue.js          # QueueManager — queue/state management
│   │   └── resolver.js       # Re-exports from tracks.js
│   └── utils/                # Shared utilities
│       ├── deploy-commands.js
│       ├── embeds.js         # Embed builders (nowplaying, queue, ping, controls)
│       ├── formatters.js
│       ├── guild-settings.js # Per-guild settings store w/ source priority
│       ├── logger.js
│       ├── music-ui.js       # Shared reply builders (snapshot, feedback, queue)
│       ├── permissions.js    # Policy helpers (requireVoice, requireDjOrAdmin, etc.)
│       ├── rate-limiter.js   # Token-bucket rate limiter
│       ├── session-store.js
│       ├── telemetry.js      # Command/track/error/connection tracking
│       └── tracks.js         # Track resolution + metadata accessors
├── lavalink/
│   ├── application.yml       # Lavalink config (logging suppressed)
│   └── Lavalink.jar
├── scripts/
│   ├── start.sh
│   └── stop.sh
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.docker
└── IMPLEMENTATION-PLAN.md
```

## Troubleshooting

### Bot not responding to commands
- Verify the bot has `applications.commands` scope enabled
- Check Discord Developer Portal for correct gateway intents

### Music not playing
- Check Lavalink logs: `docker logs auralyn`
- Ensure `LAVALINK_PASSWORD` is set and matches

### Stream errors
- The default YouTube source is deprecated in Lavalink v3; this bot uses the official YouTube plugin via Lavalink v4
- If using a managed Lavalink host, ensure it supports the YouTube plugin

## License

MIT

Auralyn is a branded fork. Upstream: [Lavakit](https://github.com/instax-dutta/lavakit).
