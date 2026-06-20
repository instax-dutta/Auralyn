# Hyperscale Sharding Guide

Auralyn now supports production-grade sharding for hyperscale deployment. This guide covers setup, monitoring, and best practices.

## Overview

Sharding distributes guild load across multiple bot processes, essential when:
- Operating 2500+ guilds (Discord requirement)
- Handling high-frequency interactions across many servers
- Deploying to multiple data centers or regions

## Quick Start

### Single Machine (Development/Small Scale)

```bash
# Auto-detect shard count and spawn processes
npm run start:shard
```

Discord will recommend shard count based on your bot token.

### Multi-Machine (Production/Hyperscale)

Set `TOTAL_SHARDS` explicitly:

```env
TOTAL_SHARDS=8                          # Use 8 shards
SHARD_SPAWN_DELAY_MS=5500               # Respect Discord identify rate limit
SHARD_SPAWN_TIMEOUT_MS=30000            # 30s per shard spawn
SHARD_HEALTH_CHECK_INTERVAL=60000       # Monitor every 60s
SHARD_MAX_MEMORY_MB=512                 # Warn if shard exceeds 512MB
GRACEFUL_SHUTDOWN_TIMEOUT=30000         # Wait 30s for graceful disconnect
SHARD_STATUS_INTERVAL=300000            # Print status every 5 min (optional)
```

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TOTAL_SHARDS` | auto | Number of shards (auto-detect or integer) |
| `SHARD_SPAWN_DELAY_MS` | 5500 | Delay between shard spawns (respect Discord limits) |
| `SHARD_SPAWN_TIMEOUT_MS` | 30000 | Timeout for each shard startup |
| `SHARD_HEALTH_CHECK_INTERVAL` | 60000 | How often to check shard health |
| `SHARD_MAX_MEMORY_MB` | 512 | Memory threshold before warning |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | 30000 | Time to wait for graceful shutdown |
| `SHARD_STATUS_INTERVAL` | - | Print status interval (optional) |

## Features

### 1. Automatic Shard Health Monitoring

- Memory usage tracking per shard
- Uptime tracking and restart counting
- Automatic respawn on crash
- Detailed logging for each shard event

### 2. Graceful Shutdown

- Music players disconnect cleanly
- Spotify cache flushed
- 30-second graceful window before force-kill
- Minimal data loss during restarts

### 3. Per-Shard Stats

Each shard exposes stats for external monitoring:

```javascript
{
  shardId: 0,
  totalShards: 8,
  uptime: 3600000,           // ms
  memoryUsageMB: 256,
  guildCount: 312,
  playerCount: 5,
  commandsLoaded: 45,
  ping: 87                   // ms to Discord gateway
}
```

### 4. Status Monitoring

Enable live status logging:

```env
SHARD_STATUS_INTERVAL=300000   # Every 5 minutes
```

Output:
```
[shard-mgr] --- Shard Status ---
[shard-mgr] Shard 0: ready | Uptime: 3600.5s | Restarts: 0
[shard-mgr] Shard 1: ready | Uptime: 3599.1s | Restarts: 0
[shard-mgr] Shard 2: ready | Uptime: 3598.2s | Restarts: 1
```

## Deployment Scenarios

### Kubernetes (Recommended for Hyperscale)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auralyn-sharding-manager
spec:
  replicas: 1  # Only one sharding manager
  selector:
    matchLabels:
      component: sharding-manager
  template:
    metadata:
      labels:
        component: sharding-manager
    spec:
      containers:
      - name: auralyn-manager
        image: auralyn:latest
        command: ["npm", "run", "start:shard"]
        env:
        - name: DISCORD_TOKEN
          valueFrom:
            secretKeyRef:
              name: discord-secrets
              key: token
        - name: TOTAL_SHARDS
          value: "8"
        - name: SHARD_MAX_MEMORY_MB
          value: "512"
        - name: SHARD_STATUS_INTERVAL
          value: "300000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          exec:
            command:
            - sh
            - -c
            - ps aux | grep "start:shard" | grep -v grep
          initialDelaySeconds: 30
          periodSeconds: 30
```

### Docker Compose

```yaml
version: '3.8'

services:
  auralyn-manager:
    image: auralyn:latest
    command: npm run start:shard
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      TOTAL_SHARDS: 8
      SHARD_SPAWN_DELAY_MS: 5500
      SHARD_HEALTH_CHECK_INTERVAL: 60000
      SHARD_MAX_MEMORY_MB: 512
      SHARD_STATUS_INTERVAL: 300000
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: always
```

### Multi-Region Deployment

For latency optimization across regions, deploy shards closer to guilds:

```
Region US-East (Shard 0-2)
Region EU-West (Shard 3-5)
Region APAC     (Shard 6-7)
```

Each shard manager spawns only its assigned shards:

```env
# US-East Node
TOTAL_SHARDS=8
# (sharding manager automatically assigns based on node capacity)

# Or explicit per-region:
# Modify shard.js to support SHARD_ID_START / SHARD_ID_END env vars
```

## Monitoring & Alerting

### Prometheus Metrics (Future Enhancement)

Track:
- Shard uptime per process
- Memory usage trending
- Restart frequency
- Guild distribution per shard
- Music player load distribution

### Alert Triggers

- Shard restart count > 5 in 1 hour
- Any shard memory > `SHARD_MAX_MEMORY_MB`
- Graceful shutdown taking > 30s
- Player disconnect cascade

## Performance Tuning

### Memory Optimization

Default: 512MB per shard

Adjust based on:
- Guild count per shard: 256 guilds = ~150MB
- Active music players: 5 players = +50MB
- Cache size: spotify-yt cache = ~50MB

```env
# For 50 guilds per shard, minimal music:
SHARD_MAX_MEMORY_MB=256

# For 500 guilds per shard, active music:
SHARD_MAX_MEMORY_MB=768
```

### Network Optimization

- Lavalink on local network (latency < 10ms)
- Discord gateway optimized (use closest datacenter)
- Redis for settings cache (if scaling to 100+ shards)

### CPU Optimization

- `SHARD_SPAWN_DELAY_MS=5500` respects Discord's rate limit
- Each shard ~50mCPU idle, ~150mCPU active
- 8 shards = ~0.8 CPU fully active

## Troubleshooting

### Shard Won't Spawn

```
[shard-mgr] Failed to spawn shards Error: Failed to spawn shard
```

Check:
1. `DISCORD_TOKEN` is valid
2. Bot has correct intents
3. Network connectivity to Discord
4. `SHARD_SPAWN_TIMEOUT_MS` not too low

Increase timeout:
```env
SHARD_SPAWN_TIMEOUT_MS=60000
```

### High Memory Usage

```
[shard-mgr] Shard 2 memory high: 768MB > 512MB
```

Investigate:
1. Music players stuck (leak)
2. Cache growing unbounded
3. Settings store too large

Action:
```env
SHARD_MAX_MEMORY_MB=1024    # Temporary increase
# Then restart shard to clear memory
```

### Repeated Restarts

```
[shard-mgr] Shard 3 process died (exitCode=1) — respawning
[shard-mgr] Shard 3 process died (exitCode=1) — respawning
```

Check logs for:
- Lavalink unreachable
- Corrupt settings.json
- Out of memory (OOM)

### Graceful Shutdown Timeout

```
[shard-mgr] Shard 2 shutdown error Error: Timeout
```

Action:
```env
GRACEFUL_SHUTDOWN_TIMEOUT=60000    # Increase to 60s
```

## Scaling Beyond 10 Shards

For 10+ shards, consider:

1. **Redis for Settings Cache**
   - Prevents disk I/O bottleneck
   - Shared across all shard processes
   - Faster guild-settings reads

2. **Separate Music Cluster**
   - Dedicated Lavalink instances
   - Load-balanced across shards
   - Geographic distribution

3. **Metrics Export**
   - Prometheus endpoint
   - Track per-shard metrics
   - Alerting integration

## Production Checklist

- [ ] Set `TOTAL_SHARDS` to recommended value
- [ ] Configure `SHARD_MAX_MEMORY_MB` for your hardware
- [ ] Enable `SHARD_STATUS_INTERVAL` for monitoring
- [ ] Test graceful shutdown: `kill -SIGTERM <pid>`
- [ ] Verify data persists across shard restarts
- [ ] Monitor Lavalink connection stability
- [ ] Set up alerting for high restart rates
- [ ] Load-test with expected guild/player count
- [ ] Document shard-to-region mapping
- [ ] Plan rollback strategy for bad deploys

## Deployment Commands

```bash
# Development: auto-detect shards
npm run start:shard

# Production: explicit shard count
TOTAL_SHARDS=8 npm run start:shard

# With monitoring
TOTAL_SHARDS=8 SHARD_STATUS_INTERVAL=300000 npm run start:shard

# Docker
docker run -e DISCORD_TOKEN=... -e TOTAL_SHARDS=8 auralyn:latest npm run start:shard
```

## Support

For issues or questions:
- Check shard logs: `SHARD_STATUS_INTERVAL=60000`
- Verify Lavalink connectivity
- Ensure settings.json is writable
- Review Discord rate limits (https://discord.com/developers/docs/topics/rate-limits)
