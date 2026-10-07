# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Project Context

- Auralyn is a production Discord music bot: discord.js v14 client + Shoukaku (Lavalink v4) playback, ESM (`"type": "module"`), Node >= 20.
- Entrypoints: `src/index.js` (single process) and `src/shard.js` (ShardingManager launcher). In the container, `scripts/start.sh` supervises Lavalink + bot.
- One-container deployment: Dockerfile + docker-compose.yml bundle the bot, Java runtime, and `lavalink/Lavalink.jar`.
- Config is 100% environment-driven through `src/config.js` (see `src/AGENTS.md`). Required vars: `DISCORD_TOKEN`, `CLIENT_ID`, `LAVALINK_PASSWORD`.
- Persisted runtime state lives under a directory resolved at startup (guild settings, sessions, playlists, liked tracks, Spotify→YT cache). The application default is `DATA_DIR=/app/data`, but `scripts/start.sh` resolves a *writable* directory first, because Pterodactyl runs containers with a read-only rootfs where `/app/data` cannot be written. Always go through `utils/data-dir.js`; never assume `/app/data`.
- Knowledge graph at `graphify-out/`: for codebase questions, use `graphify query/path/explain` first; after modifying code, run `graphify update .` (AST-only). `graphify-out/` is generated and gitignored. **Caveat:** `graphify` is not installed in this environment, so the graph is stale and this step currently cannot be performed — say so rather than claiming the graph is current.
- Planning and audit docs are root-owned reference material: `IMPLEMENTATION_PLAN.md`, `PHASE3.md`, `SHARDING.md`, `TEST_PLAN_PHASES_1-4.md`, `CODEBASE_AUDIT.md`, `technical-foundation.md`, plus `docs/superpowers/` (approved spec and plans). All are tracked; a clone missing any of them has dangling references.

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

Current known global preferences:

- Keep the knowledge graph current by running `graphify update .` after code changes. The tool is currently unavailable here, so this preference cannot be satisfied; when it cannot be, record that in the relevant handoff rather than implying the graph is fresh.
- Report a limitation as measured, not as inferred. A conclusion drawn from a warning, a filename, or a version announcement is not a verified result. Verify against the running system, or say plainly that it is unverified.

## Child DOX Index

Direct children (each owns its subtree):

- `src/AGENTS.md` — bot core: entrypoints (`index.js`, `shard.js`), env config (`config.js`), module wiring, sharding, graceful shutdown
  - `src/commands/AGENTS.md` — slash command implementations
  - `src/events/AGENTS.md` — Discord gateway event handlers
  - `src/music/AGENTS.md` — Shoukaku/Lavalink playback engine (player, queue, resolver)
  - `src/utils/AGENTS.md` — shared utilities, persistence stores, integrations
- `test/AGENTS.md` — Node test-runner suites (`npm test`)
- `scripts/AGENTS.md` — operational shell scripts and helper CLIs
- `lavalink/AGENTS.md` — bundled Lavalink v4 server (jar, application.yml, its own start.sh)
- `egg/AGENTS.md` — Pterodactyl egg packaging for hosted deploys

Root-owned (no child doc): `README.md`, `CLAUDE.md`, `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.env.example`, `.env.docker`, `.github/workflows/docker-publish.yml`, `graphify-out/` (generated, gitignored), and the root-level planning/audit docs (`IMPLEMENTATION_PLAN.md`, `PHASE3.md`, `SHARDING.md`, `TEST_PLAN_PHASES_1-4.md`, `CODEBASE_AUDIT.md`, `technical-foundation.md`).

Also root-owned: `docs/playback-canary.md` and `docs/superpowers/` (the approved spec and its plans). These are tracked in git and cited by other tracked docs, so a fresh clone must contain them. `audit_raw.json` is a superseded ~900KB raw session transcript, deliberately untracked.
