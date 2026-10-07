# Graph Report - .  (2026-06-10)

## Corpus Check
- Corpus is ~27,420 words - fits in a single context window. You may not need a graph.

## Summary
- 590 nodes · 1122 edges · 39 communities (29 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.53)
- Token cost: 5,563 input · 10,869 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Music Player Core|Music Player Core]]
- [[_COMMUNITY_Queue Management|Queue Management]]
- [[_COMMUNITY_Bot Core Architecture|Bot Core Architecture]]
- [[_COMMUNITY_Play Commands|Play Commands]]
- [[_COMMUNITY_Track Info and Help|Track Info and Help]]
- [[_COMMUNITY_Audio Filters|Audio Filters]]
- [[_COMMUNITY_Pterodactyl Egg Config|Pterodactyl Egg Config]]
- [[_COMMUNITY_Player State Control|Player State Control]]
- [[_COMMUNITY_Skip and Permissions|Skip and Permissions]]
- [[_COMMUNITY_Environment Configuration|Environment Configuration]]
- [[_COMMUNITY_Music System Core|Music System Core]]
- [[_COMMUNITY_Application Entry Point|Application Entry Point]]
- [[_COMMUNITY_Track Resolution and Spotify|Track Resolution and Spotify]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_Slash Command Deployment|Slash Command Deployment]]
- [[_COMMUNITY_Music Player Tests|Music Player Tests]]
- [[_COMMUNITY_Spotify API Integration|Spotify API Integration]]
- [[_COMMUNITY_Now Playing UI and Navigation|Now Playing UI and Navigation]]
- [[_COMMUNITY_Lavalink Configuration|Lavalink Configuration]]
- [[_COMMUNITY_Telemetry and Metrics|Telemetry and Metrics]]
- [[_COMMUNITY_Spotify YouTube Cache|Spotify YouTube Cache]]
- [[_COMMUNITY_Queue Manipulation|Queue Manipulation]]
- [[_COMMUNITY_Docker and Deployment|Docker and Deployment]]
- [[_COMMUNITY_CICD Pipeline|CI/CD Pipeline]]
- [[_COMMUNITY_Sharding|Sharding]]
- [[_COMMUNITY_Queue Display|Queue Display]]
- [[_COMMUNITY_Rate Limiting|Rate Limiting]]
- [[_COMMUNITY_Seek and Formatting|Seek and Formatting]]
- [[_COMMUNITY_Configuration Loading|Configuration Loading]]
- [[_COMMUNITY_Sleep Timer|Sleep Timer]]
- [[_COMMUNITY_Technical Foundation|Technical Foundation]]
- [[_COMMUNITY_Local Settings|Local Settings]]
- [[_COMMUNITY_Start Script|Start Script]]
- [[_COMMUNITY_Core Music Classes|Core Music Classes]]
- [[_COMMUNITY_Lavalink Startup|Lavalink Startup]]
- [[_COMMUNITY_Docker Build Script|Docker Build Script]]
- [[_COMMUNITY_Stop Script|Stop Script]]
- [[_COMMUNITY_Command Loading Tests|Command Loading Tests]]

## God Nodes (most connected - your core abstractions)
1. `buildActionFeedback()` - 89 edges
2. `Auralyn Bot` - 54 edges
3. `MusicPlayer` - 50 edges
4. `QueueManager` - 46 edges
5. `replyWithPlayerSnapshot()` - 45 edges
6. `buildNowPlayingPayload()` - 16 edges
7. `Auralyn Service (docker-compose)` - 16 edges
8. `buildSimpleV2()` - 15 edges
9. `AuralynColors` - 14 edges
10. `buildQueueReply()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Auralyn Service (docker-compose)` --references--> `Auralyn Docker Image`  [INFERRED]
  /Users/saiduttaabhishekdash/Auralyn/docker-compose.yml → /Users/saiduttaabhishekdash/Auralyn/.github/workflows/docker-publish.yml
- `Auralyn Bot` --uses--> `Shoukaku v4 (Lavalink WebSocket Client)`  [EXTRACTED]
  /Users/saiduttaabhishekdash/Auralyn/README.md → /Users/saiduttaabhishekdash/Auralyn/technical-foundation.md
- `Auralyn Bot` --uses--> `Lavalink Java Child Process`  [EXTRACTED]
  /Users/saiduttaabhishekdash/Auralyn/README.md → /Users/saiduttaabhishekdash/Auralyn/technical-foundation.md
- `Technical Foundation Document` --documents--> `Auralyn Bot`  [EXTRACTED]
  /Users/saiduttaabhishekdash/Auralyn/technical-foundation.md → /Users/saiduttaabhishekdash/Auralyn/README.md
- `Shoukaku v4 (Lavalink WebSocket Client)` --references--> `Lavalink v4`  [INFERRED]
  /Users/saiduttaabhishekdash/Auralyn/technical-foundation.md → /Users/saiduttaabhishekdash/Auralyn/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **docker_build_pipeline** —  [EXTRACTED]
- **audio_pipeline_architecture** —  [EXTRACTED]
- **deployment_targets** —  [EXTRACTED]
- **music_subsystem** —  [EXTRACTED]
- **lavalink_plugin_stack** —  [EXTRACTED]
- **env_config_cross_references** —  [EXTRACTED]

## Communities (39 total, 10 thin omitted)

### Community 0 - "Music Player Core"
Cohesion: 0.07
Nodes (4): isFilterPayloadMeaningful(), MusicPlayer, FakeNode, extractYoutubeVideoId()

### Community 2 - "Bot Core Architecture"
Cohesion: 0.06
Nodes (36): Auralyn Bot, Slash Commands, discord.js v14, src/commands/ (Slash Command Handlers), src/config.js, src/events/ (Discord Event Handlers), src/utils/ (Shared Utilities), Embedded Lavalink (child Java process) (+28 more)

### Community 3 - "Play Commands"
Cohesion: 0.10
Nodes (19): execute(), execute(), execute(), execute(), buildSearchV2(), execute(), DEFAULT_SOURCE_PRIORITY, defaultGuildSettings (+11 more)

### Community 4 - "Track Info and Help"
Cohesion: 0.10
Nodes (23): execute(), formatMs(), progressBar(), sourceLabel(), buildCommandText(), buildHelpComponents(), CATEGORIES, execute() (+15 more)

### Community 5 - "Audio Filters"
Cohesion: 0.10
Nodes (16): execute(), execute(), LEVEL_MAP, execute(), execute(), execute(), execute(), execute() (+8 more)

### Community 6 - "Pterodactyl Egg Config"
Cohesion: 0.08
Nodes (24): author, _comment, config, files, logs, startup, stop, description (+16 more)

### Community 7 - "Player State Control"
Cohesion: 0.12
Nodes (13): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+5 more)

### Community 8 - "Skip and Permissions"
Cohesion: 0.16
Nodes (8): execute(), canManagePlayback(), canUsePlayerControls(), hasDjRole(), isAdminLikeMember(), isSameVoiceChannel(), requireDjOrAdmin(), JsonSessionStore

### Community 9 - "Environment Configuration"
Cohesion: 0.12
Nodes (21): Lavasrc Spotify Source Config, Egg Resource Requirements (2048MB RAM/1024MB disk), Egg Security Requirements, Egg Startup Script (/app/scripts/start.sh), CLIENT_ID, DISCORD_TOKEN, GUILD_ID, LAVALINK_HOST (+13 more)

### Community 10 - "Music System Core"
Cohesion: 0.15
Nodes (13): END_REASONS_THAT_SHOULD_ADVANCE, RECOVERABLE_VOICE_CLOSE_CODES, OBJECT_SLOTS, checkStackConflict(), FILTER_LABELS, FILTER_PRESETS, getConflictReason(), OBJECT_SLOTS (+5 more)

### Community 11 - "Application Entry Point"
Cohesion: 0.14
Nodes (15): client, config, __dirname, __filename, guildSyncLimiter, loadCommands(), loadEvents(), logger (+7 more)

### Community 12 - "Track Resolution and Spotify"
Cohesion: 0.17
Nodes (18): isSpotifyUrl(), hasOfficialSignal(), hasUnofficialMarker(), isDirectUrl(), OFFICIAL_AUTHOR_PATTERNS, OFFICIAL_TITLE_PATTERNS, pickBestSearchResult(), queryRequestsUnofficial() (+10 more)

### Community 13 - "Project Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, discord.js, dotenv, shoukaku, spotify-url-info, description, engines, node (+9 more)

### Community 14 - "Slash Command Deployment"
Cohesion: 0.24
Nodes (10): deployCommands(), deployCommandsForGuild(), __dirname, __filename, getCommandDeploymentTargets(), hashCommands(), loadCommandPayloads(), createLogger() (+2 more)

### Community 16 - "Spotify API Integration"
Cohesion: 0.30
Nodes (14): fetchAllPages(), { getData }, getPlaylistArtwork(), getSpotifyAccessToken(), getSpotifyCredentials(), joinArtists(), parseSpotifyUrl(), pickLargestImage() (+6 more)

### Community 17 - "Now Playing UI and Navigation"
Cohesion: 0.30
Nodes (11): execute(), buildNowPlayingPayload(), buildProgressBar(), loopButtonLabel(), loopButtonStyle(), formatDuration(), trackArtwork(), trackAuthor() (+3 more)

### Community 18 - "Lavalink Configuration"
Cohesion: 0.19
Nodes (13): Shoukaku v4 (Lavalink WebSocket Client), Lavasrc Search Providers, YouTube Plugin Settings (clients/limits), Lavalink application.yml, Lavalink Audio Buffer & Quality Config, Lavalink Java Child Process, Lavalink Logging Level Config, Lavalink Built-in Sources (SoundCloud/Twitch/Bandcamp/HTTP/Local) (+5 more)

### Community 21 - "Queue Manipulation"
Cohesion: 0.36
Nodes (7): execute(), buildVoteV2(), execute(), hasDjRole(), requiredVotes(), buildRemovedTrackEmbed(), trackTitle()

### Community 22 - "Docker and Deployment"
Cohesion: 0.22
Nodes (8): src/index.js (Entry Point), Auralyn Docker Image, Dockerfile, Auralyn Bridge Network, Docker Compose, Java 17, Node.js 18+, Pelican/Pterodactyl Panel

### Community 23 - "CI/CD Pipeline"
Cohesion: 0.25
Nodes (8): Docker Buildx, actions/checkout, GitHub Container Registry (ghcr.io), GITHUB_TOKEN Secret, Manual Workflow Dispatch, Push to Main Branch Trigger, Version Tag Push Trigger, Publish Docker Image Workflow

### Community 24 - "Sharding"
Cohesion: 0.25
Nodes (6): __dirname, __filename, logger, manager, SPAWN_DELAY_MS, SPAWN_TIMEOUT_MS

### Community 25 - "Queue Display"
Cohesion: 0.43
Nodes (4): execute(), execute(), execute(), buildQueueReply()

### Community 27 - "Seek and Formatting"
Cohesion: 0.47
Nodes (3): execute(), formatLoopMode(), parseTimeInput()

### Community 28 - "Configuration Loading"
Cohesion: 0.60
Nodes (5): loadConfig(), optionalEnv(), optionalNumberEnv(), REQUIRED_ENV, requireEnv()

### Community 30 - "Technical Foundation"
Cohesion: 0.40
Nodes (5): ES Modules Only (import/export), Hard Engineering Constraints, Infrastructure Files Are Ops-Owned, No New npm Dependencies Policy, Technical Foundation Document

### Community 31 - "Local Settings"
Cohesion: 0.50
Nodes (3): permissions, allow, prefersReducedMotion

### Community 32 - "Start Script"
Cohesion: 0.83
Nodes (3): cleanup(), require_env(), start.sh script

### Community 33 - "Core Music Classes"
Cohesion: 0.67
Nodes (3): MusicPlayer Class (playback logic), QueueManager Class (queue state + history), src/music/ (Music Domain)

## Knowledge Gaps
- **135 isolated node(s):** `allow`, `prefersReducedMotion`, `_comment`, `version`, `update_url` (+130 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `QueueManager` connect `Queue Management` to `Music System Core`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `MusicPlayer` connect `Music Player Core` to `Music System Core`, `Application Entry Point`, `Music Player Tests`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `buildActionFeedback()` connect `Player State Control` to `Play Commands`, `Track Info and Help`, `Audio Filters`, `Skip and Permissions`, `Slash Command Deployment`, `Now Playing UI and Navigation`, `Queue Manipulation`, `Queue Display`, `Seek and Formatting`, `Sleep Timer`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `allow`, `prefersReducedMotion`, `_comment` to the rest of the system?**
  _135 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Music Player Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06638714185883997 - nodes in this community are weakly interconnected._
- **Should `Queue Management` be split into smaller, more focused modules?**
  _Cohesion score 0.08773784355179703 - nodes in this community are weakly interconnected._
- **Should `Bot Core Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._