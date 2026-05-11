#!/bin/sh
set -e

echo "=========================================="
echo "  Starting Auralyn Music Bot"
echo "=========================================="

# Function to handle cleanup on exit
cleanup() {
    echo "Shutting down..."
    # Kill Lavalink first (graceful drain)
    if [ -n "$LAVALINK_PID" ]; then
        kill $LAVALINK_PID 2>/dev/null || true
        # Wait a bit for Lavalink to shut down
        sleep 2
    fi
    # Then kill the bot
    if [ -n "$BOT_PID" ]; then
        kill $BOT_PID 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start Lavalink in background
echo "[1/3] Starting Lavalink..."
cd /app/lavalink
java -Xmx${LAVALINK_MEMORY:-1G} -jar Lavalink.jar > /app/lavalink.log 2>&1 &
LAVALINK_PID=$!
echo "      Lavalink started (PID: $LAVALINK_PID)"

# Wait for Lavalink to be ready
echo "[2/3] Waiting for Lavalink..."
LAVALINK_READY=false
TIMEOUT=${LAVALINK_STARTUP_TIMEOUT:-60}
i=1
while [ $i -le $TIMEOUT ] && [ "$LAVALINK_READY" = "false" ]; do
    if curl -s --connect-timeout 2 http://localhost:2333/v4/info > /dev/null 2>&1; then
        LAVALINK_READY=true
        break
    fi
    sleep 1
    i=$((i+1))
done

if [ "$LAVALINK_READY" = "false" ]; then
    echo "ERROR: Lavalink failed to start within ${TIMEOUT} seconds"
    cat /app/lavalink.log
    exit 1
fi
echo "      Lavalink is ready!"

# Start the Discord bot
echo "[3/3] Starting Auralyn bot..."
cd /app
node src/index.js > /app/bot.log 2>&1 &
BOT_PID=$!
echo "      Bot started (PID: $BOT_PID)"

# Watchdog loop: monitor Lavalink process
echo "[4/4] Starting watchdog..."
while kill -0 $LAVALINK_PID 2>/dev/null; do
    sleep 5
done

# If we get here, Lavalink has died
echo "ERROR: Lavalink process has died"
exit 1