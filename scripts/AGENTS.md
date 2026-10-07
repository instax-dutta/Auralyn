# scripts — Operations Scripts

## Purpose

Operational shell scripts and Node helper CLIs for building, running, and maintaining the bot.

## Ownership

- `start.sh` — container entrypoint: requires `DISCORD_TOKEN`, `CLIENT_ID`, `LAVALINK_PASSWORD`; resolves a writable data directory, starts Lavalink with documented JVM tuning and a writable `java.io.tmpdir`, waits for readiness via `GET /v4/info` (auth header), launches the bot (default `src/shard.js`); supervises both PIDs and traps INT/TERM for graceful cleanup
- `stop.sh` — stop helper
- `build-docker.sh` — Docker image build helper
- `clear-guild-commands.js` — removes registered guild commands via Discord REST
- `remote-test.sh` — rsyncs the working tree to a remote host and runs a command there. Connection details come from `AURALYN_SSH_KEY`, `AURALYN_SSH_HOST`, and `AURALYN_REMOTE_DIR`; never hardcode a key path, host, or home directory, since all three are per-operator

## Local Contracts

- POSIX sh, `set -eu`; documented exit codes: 64 = missing required env, 66 = missing Lavalink jar/application.yml, 78 = no writable data directory or the Lavalink temp dir could not be created.
- **Assume the filesystem may be read-only.** Pterodactyl runs these containers with a read-only rootfs, so `/app/data` and `/tmp` cannot be written by anyone. Anything that persists must resolve a writable path before use, or the server dies at boot with a Java or `EROFS` stack trace.
- **The data directory is resolved, not assumed.** When `DATA_DIR` is unset, `start.sh` probes `DATA_DIR_DEFAULT` (default `/app/data`), then `DATA_DIR_FALLBACK` (default `/home/container/data`), and exports whichever works. An explicitly configured `DATA_DIR` is never overridden; if it is unwritable that is reported as a misconfiguration and exits 78 rather than being silently redirected.
- Writability is proven with `touch`, never `[ -w ]` (which reports true on a read-only filesystem) and never a bare redirection (under `set -e` a failed redirection aborts the shell before an `if !` can inspect it).
- **Lavalink needs `-Djava.io.tmpdir` pointing at a writable path.** Undertow creates its document base under `java.io.tmpdir`, so the default `/tmp` kills startup under a read-only rootfs. It is set to `$DATA_DIR/lavalink-tmp` because the process cannot create directories directly under `/home/container`, which belongs to another uid.
- JVM flags in `start.sh` are audio-performance tuning (G1GC, `MaxGCPauseMillis=50`, heap defaults); keep the inline rationale comments when changing them.
- Scripts are idempotent and safe to re-run.

## Work Guidance

- `lavalink/start.sh` also exists (run inside the Lavalink dir); `scripts/start.sh` is the container-level supervisor — do not conflate the two.
- Any new env var (see `src/config.js`) must be handled here and in Dockerfile/docker-compose as relevant.

## Verification

- `test/startup-data-dir.test.js` drives this script with stubbed `node`/`java`/`curl` and asserts data-directory resolution, that an explicit `DATA_DIR` is never overridden, that an unwritable fallback is refused with exit 78, and that `java` is launched with a writable `-Djava.io.tmpdir`.
- Boot itself is verified live on a read-only rootfs, not hermetically: run the image with `--read-only` and confirm the data directory resolves and Lavalink reaches ready.

## Child DOX Index

- None (flat file set).
