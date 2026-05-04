#!/bin/bash
set -e

echo "=========================================="
echo "  Starting Auralyn Music Bot"
echo "=========================================="

# Function to handle cleanup on exit
cleanup() {
    echo "Shutting down..."
    pkill -f "node.*index.js" || true
    pkill -f "Lavalink.jar" || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start Lavalink in background
echo "[1/3] Starting Lavalink..."
cd /app/lavalink
java -Xmx1G -jar Lavalink.jar > /app/lavalink.log 2>&1 &
LAVALINK_PID=$!
echo "      Lavalink started (PID: $LAVALINK_PID)"

# Wait for Lavalink to be ready
echo "[2/3] Waiting for Lavalink..."
LAVALINK_READY=false
for i in {1..30}; do
    if curl -s --connect-timeout 2 http://localhost:2333/v4/info > /dev/null 2>&1; then
        LAVALINK_READY=true
        break
    fi
    sleep 1
done

if [ "$LAVALINK_READY" = "false" ]; then
    echo "ERROR: Lavalink failed to start within 30 seconds"
    cat /app/lavalink.log
    exit 1
fi
echo "      Lavalink is ready!"

# Start the Discord bot
echo "[3/3] Starting Auralyn bot..."
cd /app
exec node src/index.js