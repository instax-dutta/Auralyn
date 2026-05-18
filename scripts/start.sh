#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/app}"
LAVALINK_DIR="${LAVALINK_DIR:-$APP_DIR/lavalink}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_HOST="${LAVALINK_HOST:-127.0.0.1}"
LAVALINK_MEMORY="${LAVALINK_MEMORY:-1G}"
LAVALINK_STARTUP_TIMEOUT="${LAVALINK_STARTUP_TIMEOUT:-60}"
BOT_ENTRYPOINT="${BOT_ENTRYPOINT:-$APP_DIR/src/index.js}"

require_env() {
    name="$1"
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        echo "ERROR: $name is required." >&2
        exit 64
    fi
}

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
java -Xmx"$LAVALINK_MEMORY" -jar Lavalink.jar &
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
