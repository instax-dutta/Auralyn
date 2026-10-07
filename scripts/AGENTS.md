# scripts — Operations Scripts

## Purpose

Operational shell scripts and Node helper CLIs for building, running, and maintaining the bot.

## Ownership

- `start.sh` — container entrypoint: requires `DISCORD_TOKEN`, `CLIENT_ID`, `LAVALINK_PASSWORD`; starts Lavalink with documented JVM tuning, waits for readiness via `GET /v4/info` (auth header), launches the bot (default `src/shard.js`); supervises both PIDs and traps INT/TERM for graceful cleanup
- `stop.sh` — stop helper
- `build-docker.sh` — Docker image build helper
- `clear-guild-commands.js` — removes registered guild commands via Discord REST
- `remote-test.sh` — rsyncs the working tree to a remote host and runs a command there. Connection details come from `AURALYN_SSH_KEY`, `AURALYN_SSH_HOST`, and `AURALYN_REMOTE_DIR`; never hardcode a key path, host, or home directory, since all three are per-operator

## Local Contracts

- POSIX sh, `set -eu`; documented exit codes: 64 = missing required env, 66 = missing Lavalink jar/application.yml.
- JVM flags in `start.sh` are audio-performance tuning (G1GC, `MaxGCPauseMillis=50`, heap defaults); keep the inline rationale comments when changing them.
- Scripts are idempotent and safe to re-run.

## Work Guidance

- `lavalink/start.sh` also exists (run inside the Lavalink dir); `scripts/start.sh` is the container-level supervisor — do not conflate the two.
- Any new env var (see `src/config.js`) must be handled here and in Dockerfile/docker-compose as relevant.

## Verification

- No automated checks; manual smoke test via `docker-compose up` exercising `scripts/start.sh`.

## Child DOX Index

- None (flat file set).
