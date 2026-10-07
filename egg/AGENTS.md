# egg — Pterodactyl Egg Packaging

## Purpose

Pterodactyl panel packaging that lets hosts run Auralyn as a managed game-server-style egg.

## Ownership

- `egg-auralyn.json` — the Pterodactyl egg definition (install/start commands, variables)
- `config.yml` — egg panel configuration

## Local Contracts

- Egg variables mirror the documented env vars (see `README.md`, `.env.example`, `src/config.js`): `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `LAVALINK_PASSWORD`, `LOG_LEVEL`, feature flags, etc.
- Egg start/install behavior must stay consistent with `Dockerfile` and `scripts/start.sh`.
- Pterodactyl containers run with a read-only rootfs, so nothing inside the image can be written. That is why `scripts/start.sh` resolves a writable data directory instead of using the `/app/data` default. Do not add an egg variable that hardcodes a data path into the image; the writable path is the server volume, and `start.sh` already knows how to find it.

## Work Guidance

- When env vars change in `src/config.js`, update `.env.example` AND `egg-auralyn.json` variables together.
- Keep the egg JSON valid (parseable by `node`/`jq`) after edits.

## Verification

- No automated suite. Validate by parsing the JSON: `node -e "JSON.parse(require('fs').readFileSync('egg/egg-auralyn.json'))"`.
- Boot on a read-only rootfs is verified live, not hermetically: run the image with `--read-only` and a server-volume mount, then confirm the data directory resolves and Lavalink reaches ready.

## Child DOX Index

- None (flat file set).
