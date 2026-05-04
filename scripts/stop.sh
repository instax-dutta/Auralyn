#!/bin/bash

echo "Stopping Auralyn..."

# Kill Node.js process (the bot)
pkill -f "node.*index.js" || true

# Kill Lavalink
pkill -f "Lavalink.jar" || true

echo "Auralyn stopped."