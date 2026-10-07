#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/app}"
LAVALINK_DIR="${LAVALINK_DIR:-$APP_DIR/lavalink}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_HOST="${LAVALINK_HOST:-127.0.0.1}"
LAVALINK_MEMORY="${LAVALINK_MEMORY:-1G}"
LAVALINK_STARTUP_TIMEOUT="${LAVALINK_STARTUP_TIMEOUT:-60}"
# Default to the ShardingManager entrypoint. With TOTAL_SHARDS='auto' this
# works as a single-shard launcher for small bots and scales transparently
# past Discord's 2,500-guild-per-shard threshold. Override with
# BOT_ENTRYPOINT=/app/src/index.js to bypass sharding for local debugging.
BOT_ENTRYPOINT="${BOT_ENTRYPOINT:-$APP_DIR/src/shard.js}"

require_env() {
    name="$1"
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        echo "ERROR: $name is required." >&2
        exit 64
    fi
}

# True only when the directory exists (or can be created) AND a real file can be
# written into it. `[ -w ]` is not enough: it reports true on a read-only
# filesystem, which is exactly the Pterodactyl case.
dir_is_writable() {
    candidate="$1"
    if [ ! -d "$candidate" ]; then
        mkdir -p "$candidate" 2>/dev/null || return 1
    fi
    probe="$candidate/.auralyn-write-probe.$$"
    # touch rather than a redirection: under `set -e` a failed redirection aborts
    # the shell before an `if !` can inspect it, whereas touch reports failure as
    # an ordinary non-zero exit status.
    touch "$probe" 2>/dev/null || return 1
    rm -f "$probe" 2>/dev/null || true
    return 0
}

# Resolve a data directory this process can actually write.
#
# The application defaults DATA_DIR to /app/data. Under Pterodactyl the root
# filesystem is read-only, so that default can never be written and every boot
# died with "EROFS: read-only file system, open '/app/data/sessions.json.lock'".
# The only writable path there is the /home/container bind mount.
#
# An explicitly configured DATA_DIR is never overridden: if it is unwritable that
# is a misconfiguration to report, not to paper over.
if [ -z "${DATA_DIR:-}" ]; then
    DATA_DIR_DEFAULT="${DATA_DIR_DEFAULT:-/app/data}"
    DATA_DIR_FALLBACK="${DATA_DIR_FALLBACK:-/home/container/data}"

    if dir_is_writable "$DATA_DIR_DEFAULT"; then
        DATA_DIR="$DATA_DIR_DEFAULT"
    elif dir_is_writable "$DATA_DIR_FALLBACK"; then
        echo "WARNING: $DATA_DIR_DEFAULT is not writable; using $DATA_DIR_FALLBACK instead." >&2
        DATA_DIR="$DATA_DIR_FALLBACK"
    else
        echo "ERROR: no writable data directory. $DATA_DIR_DEFAULT is unwritable and neither can $DATA_DIR_FALLBACK be created." >&2
        exit 78
    fi

    export DATA_DIR
    echo "Data directory: $DATA_DIR"
elif ! dir_is_writable "$DATA_DIR"; then
    echo "ERROR: DATA_DIR is set to $DATA_DIR, which this process cannot write." >&2
    exit 78
fi

cleanup() {
    echo "Stopping Auralyn..."
    if [ -n "${BOT_PID:-}" ] && kill -0 "$BOT_PID" 2>/dev/null; then
        kill "$BOT_PID" 2>/dev/null || true
    fi
    if [ -n "${LAVALINK_PID:-}" ] && kill -0 "$LAVALINK_PID" 2>/dev/null; then
        kill "$LAVALINK_PID" 2>/dev/null || true
    fi
    wait ${BOT_PID:-} 2>/dev/null || true
    wait ${LAVALINK_PID:-} 2>/dev/null || true
}

trap 'cleanup; exit 0' INT TERM

require_env DISCORD_TOKEN
require_env CLIENT_ID
require_env LAVALINK_PASSWORD

if [ ! -f "$LAVALINK_DIR/Lavalink.jar" ]; then
    echo "ERROR: Lavalink.jar was not found at $LAVALINK_DIR/Lavalink.jar." >&2
    exit 66
fi

if [ ! -f "$LAVALINK_DIR/application.yml" ]; then
    echo "ERROR: Lavalink application.yml was not found at $LAVALINK_DIR/application.yml." >&2
    exit 66
fi

echo "=========================================="
echo "  Starting Auralyn"
echo "=========================================="
echo "Runtime: Node $(node --version), Java $(java -version 2>&1 | head -n 1)"
echo "Lavalink: $LAVALINK_HOST:$LAVALINK_PORT"

cd "$LAVALINK_DIR"
# Lavalink needs a writable temp dir. Under Pterodactyl the whole rootfs is
# read-only, including /tmp, and Undertow creates its document base under
# java.io.tmpdir, so leaving the default kills startup with
# "FileSystemException: /tmp/undertow-docbase...: Read-only file system".
# It lives under the resolved data dir because that is the one place this process
# is known to be able to write; the container cannot create directories directly
# under /home/container, which belongs to another uid.
LAVALINK_TMPDIR="${LAVALINK_TMPDIR:-$DATA_DIR/lavalink-tmp}"
if ! mkdir -p "$LAVALINK_TMPDIR" 2>/dev/null; then
    echo "ERROR: could not create the Lavalink temp dir $LAVALINK_TMPDIR." >&2
    exit 78
fi

# JVM tuning for audio DSP performance:
#   -server           : force server-mode JIT (C2 compiler) from the start
#   -XX:+UseG1GC      : G1 collector — shorter, predictable GC pauses vs default
#   -XX:MaxGCPauseMillis=50 : target GC pause budget under 50ms (avoids audio dropout)
#   -XX:+DisableExplicitGC  : ignore System.gc() calls from libraries
#   -XX:+OptimizeStringConcat: micro-opt for string-heavy logging paths
#   -XX:+UseStringDeduplication: reduce heap pressure from repeated String objects
java -Djava.io.tmpdir="$LAVALINK_TMPDIR" \
    -server \
    -Xmx"$LAVALINK_MEMORY" \
    -Xms256m \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=50 \
    -XX:+DisableExplicitGC \
    -XX:+OptimizeStringConcat \
    -XX:+UseStringDeduplication \
    -jar Lavalink.jar \
    --server.address="$LAVALINK_HOST" \
    --server.port="$LAVALINK_PORT" &
LAVALINK_PID=$!
echo "Lavalink started with PID $LAVALINK_PID"

echo "Waiting up to ${LAVALINK_STARTUP_TIMEOUT}s for Lavalink..."
i=1
while [ "$i" -le "$LAVALINK_STARTUP_TIMEOUT" ]; do
    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
        echo "ERROR: Lavalink exited before it became ready." >&2
        exit 1
    fi

    if curl --fail --silent --connect-timeout 2 \
        --header "Authorization: ${LAVALINK_PASSWORD}" \
        "http://127.0.0.1:${LAVALINK_PORT}/v4/info" > /dev/null 2>&1; then
        echo "Lavalink is ready."
        break
    fi

    if [ "$i" -eq "$LAVALINK_STARTUP_TIMEOUT" ]; then
        echo "ERROR: Lavalink did not become ready within ${LAVALINK_STARTUP_TIMEOUT}s." >&2
        exit 1
    fi

    sleep 1
    i=$((i + 1))
done

cd "$APP_DIR"
node "$BOT_ENTRYPOINT" &
BOT_PID=$!
echo "Auralyn bot started with PID $BOT_PID"
echo "Auralyn is running."

while :; do
    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
        echo "ERROR: Lavalink process stopped." >&2
        cleanup
        exit 1
    fi

    if ! kill -0 "$BOT_PID" 2>/dev/null; then
        echo "ERROR: Bot process stopped." >&2
        cleanup
        exit 1
    fi

    sleep 5
done
