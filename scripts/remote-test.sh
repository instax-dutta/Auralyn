#!/bin/sh
# Sync the working tree to the remote test host and run a command there.
# Local is for editing only; anything CPU-bound runs on the server.
#
# Usage:
#   ./scripts/remote-test.sh                 # full suite
#   ./scripts/remote-test.sh test/foo.test.js   # one file
set -e

# Connection details are per-operator. Override any of these via the environment
# rather than editing the script: the previous hardcoded key path leaked the
# author's local username and directory layout into the repo, and made this
# unusable from any other machine.
: "${AURALYN_SSH_KEY:=$HOME/.ssh/auralyn-test.pem}"
: "${AURALYN_SSH_HOST:=admin@23.23.142.61}"
: "${AURALYN_REMOTE_DIR:=~/dev/Auralyn}"

KEY="$AURALYN_SSH_KEY"
HOST="$AURALYN_SSH_HOST"
REMOTE_DIR="$AURALYN_REMOTE_DIR"

if [ ! -f "$KEY" ]; then
  echo "ERROR: SSH key not found at $KEY" >&2
  echo "Set AURALYN_SSH_KEY=/path/to/key. This is a personal test host; there is no default that is correct for anyone else." >&2
  exit 78
fi

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