# Auralyn - Discord Music Bot

A production-ready Discord music bot with integrated Lavalink server, ready for deployment on Pelican/Pterodactyl panels.

## Features

- 🎵 Discord.js v14 with slash commands
- 🔊 Music playback via Lavalink v4
- 🎨 Beautiful embeds with consistent branding
- 🐳 Docker-ready for easy deployment
- 📦 Self-contained (bot + Lavalink in one container)

## Requirements

- Docker
- Node.js 18+ (for local development)
- Java 17 (included in Docker image)

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

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | Yes |
| `CLIENT_ID` | Your Discord application client ID | Yes |
| `GUILD_ID` | Discord server ID for guild commands | No |
| `LAVALINK_PASSWORD` | Password for Lavalink server | No |
| `LAVALINK_PORT` | Lavalink port (default: 2333) | No |

## Pelican/Pterodactyl Panel Deployment

### Option 1: Custom Docker Image

1. Build and push the image to your registry:
```bash
docker build -t ghcr.io/yourrepo/auralyn:latest .
docker push ghcr.io/yourrepo/auralyn:latest
```

2. In your panel, create a new egg with:
   - Image: `ghcr.io/yourrepo/auralyn:latest`
   - Startup: `node src/index.js`
   - Memory: 2048MB
   - CPU: 100%

3. Add these environment variables:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `LAVALINK_PASSWORD`

### Option 2: From Source

1. Upload the bot files to your server
2. Install dependencies: `npm install`
3. Set environment variables
4. Run: `node src/index.js`

## Commands

| Command | Description |
|---------|-------------|
| `/play` | Play a song or add to queue |
| `/pause` | Pause the current song |
| `/resume` | Resume paused song |
| `/skip` | Skip the current song |
| `/stop` | Stop music and clear queue |
| `/queue` | Show current queue |
| `/nowplaying` | Show current track |
| `/volume` | Set volume (0-100) |
| `/loop` | Toggle loop mode |
| `/shuffle` | Shuffle the queue |
| `/remove` | Remove track from queue |
| `/ping` | Check bot latency |

## Project Structure

```
auralyn/
├── src/
│   ├── index.js          # Main entry point
│   ├── deploy-commands.js
│   ├── commands/         # Slash commands
│   ├── events/            # Event handlers
│   └── utils/             # Utility functions
├── lavalink/
│   ├── application.yml   # Lavalink config
│   └── Lavalink.jar       # Lavalink server
├── scripts/
│   ├── start.sh           # Docker start script
│   └── stop.sh            # Stop script
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Local development
├── package.json
└── .env.docker            # Environment template
```

## Troubleshooting

### Bot not responding to commands
- Verify the bot has `applications.commands` scope
- Check Discord Developer Portal for correct intents

### Music not playing
- Check Lavalink logs: `docker logs auralyn`
- Ensure YouTube/SoundCloud access is working

### Stream errors
- The default YouTube source is deprecated
- Consider using a managed Lavalink host for better reliability

## License

MIT