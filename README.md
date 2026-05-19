# Auralyn — Zero-Infrastructure Discord Music for Production Communities

Every Discord server deserves crystal-clear audio — without the headache of managing a separate Lavalink server, Java runtime, version mismatches, or port configurations. **Auralyn** bundles everything into a single container. One build, one deploy, zero infrastructure fuss.

Built for communities that refuse to compromise on sound quality. The first bot to ship Lavalink, YouTube plugin, lavasrc, and the entire audio pipeline pre-integrated and ready to run.

## What You Get

### Plug-and-Play Audio
- One-container deployment — Lavalink v4, Java runtime, and bot all ship together
- High-fidelity playback with automatic volume normalization
- Full queue control: shuffle, remove, track-repeat, queue-repeat
- Interactive skip/pause/resume/stop buttons on every embed

### Smarter Track Resolution
- **Priority-based search** — configure source order per guild (direct link first, then Spotify metadata, then YouTube search fallback)
- **Best-match ranking** — search results scored by title match, duration, artwork presence, and author metadata; you get the best result, not the first result
- **Graceful fallback** — if Spotify resolution fails, YouTube search kicks in automatically
- **Source badges** — every "now playing" display shows where the track came from

### Built for Real Communities
- **Feature flags** — toggle global/guild command sync, debug commands, and strict DJ mode via environment variables
- **Rate-limited onboarding** — command deployment throttled on mass guild join to stay inside Discord's API limits
- **Usage telemetry** — track commands, tracks played, errors, voice sessions, and Lavalink reconnects
- **Permission helpers** — consistent voice-channel and role checks with clear error messages
- **Production logs** — Lavalink Spring Boot noise suppressed; clean output you can actually read

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

MIT — use it, modify it, ship it. Auralyn was built for the community.

---

*Crystal-clear audio. Seamless playback. Fast queues. Smart search. Smooth performance.*
