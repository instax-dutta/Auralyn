#!/bin/sh
set -eu

pkill -f "node .*src/index.js" || true
pkill -f "Lavalink.jar" || true
