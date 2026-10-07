# egg — Pterodactyl Egg Packaging

## Purpose

Pterodactyl panel packaging that lets hosts run Auralyn as a managed game-server-style egg.

## Ownership

- `egg-auralyn.json` — the Pterodactyl egg definition (install/start commands, variables)
- `config.yml` — egg panel configuration

## Local Contracts

- Egg variables mirror the documented env vars (see `README.md`, `.env.example`, `src/config.js`): `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `LAVALINK_PASSWORD`, `LOG_LEVEL`, feature flags, etc.
- Egg start/install behavior must stay consistent with `Dockerfile` and `scripts/start.sh`.

## Work Guidance

- When env vars change in `src/config.js`, update `.env.example` AND `egg-auralyn.json` variables together.
- Keep the egg JSON valid (parseable by `node`/`jq`) after edits.

## Verification

- No automated suite; validate by parsing the JSON (`node -e "JSON.parse(require('fs').readFileSync('egg/egg-auralyn.json'))"`).

## Child DOX Index

- None (flat file set).
