#!/bin/sh
# Sync the working tree to the remote test host and run a command there.
# Local is for editing only; anything CPU-bound runs on the server.
#
# Usage:
#   ./scripts/remote-test.sh                 # full suite
#   ./scripts/remote-test.sh test/foo.test.js   # one file
set -e

KEY="/Users/saiduttaabhishekdash/Downloads/LightsailDefaultKey-us-east-1 (2).pem"
HOST="admin@23.23.142.61"
REMOTE_DIR="~/dev/Auralyn"

rsync -az --delete -e "ssh -i '$KEY' -o StrictHostKeyChecking=no" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'graphify-out/cache/' \
  --exclude '.claude/' \
  --exclude '.mimocode/' \
  --exclude '*.log' \
  "$PWD/" "$HOST:$REMOTE_DIR/"

if [ "$#" -eq 0 ]; then
  TARGET="npm test"
else
  TARGET="node --test $*"
fi

ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" "cd $REMOTE_DIR && $TARGET"