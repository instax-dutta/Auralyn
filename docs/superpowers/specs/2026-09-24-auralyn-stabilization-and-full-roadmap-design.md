# Auralyn Stabilization and Full Roadmap Design

**Date:** 2026-09-24
**Status:** Design approved in conversation; self-reviewed; pending written-spec review
**Target topology:** One Docker host with one Lavalink service and multiple Node shards
**Testing model:** Test-driven development with mandatory RED-GREEN-REFACTOR evidence

## Purpose

Auralyn currently has a substantial Discord music-bot implementation, but the source tree, historical plans, and operational documentation disagree about what is complete. This design turns the full roadmap into a verifiable sequence: first repair correctness and production safety, then complete Phase 4, implement Phase 5, and finish operational hardening.

The work is intentionally incremental. No production behavior changes without a failing behavioral test that demonstrates the missing or broken behavior first.

## Goals

- Make core playback, queue, permissions, component interactions, persistence, and sharding reliable.
- Complete the playlist and liked-song feature set without breaking existing command aliases.
- Implement Spotify OAuth, Last.fm, radio, music logging, and utility commands with local-first validation.
- Keep the bot usable in a single-host sharded deployment with bundled Lavalink.
- Replace stale completion claims with test-backed status.
- Establish a repeatable CI and operational verification path.

## Non-goals

- Multi-host or multi-region coordination in this delivery.
- A rewrite of discord.js, Shoukaku, or Lavalink.
- Live external-service tests without explicitly supplied credentials and configuration.
- Adding a test framework or database dependency without a separately approved design change.
- Claiming production readiness from static code inspection alone.

## Architecture decisions

### Single-host storage

Use independently owned files under the configured data directory:

- One settings file per guild.
- One session file per guild.
- One playlist file per user.
- One liked-songs file per user.
- Integration token/session files under user-scoped paths.

Writes use temporary files followed by atomic rename. A guild is expected to be handled by one shard, so separate guild files prevent cross-shard whole-file overwrites. Storage APIs remain behind small interfaces so a future shared-store adapter can replace files without changing command contracts.

The implementation must migrate existing global JSON files idempotently without deleting source data before the migrated copy is verified.

### Sharding and synchronization

- The shard manager owns global command deployment.
- Each shard owns guild-specific command synchronization.
- The manager sends a typed IPC shutdown message; each child handles it and performs normal player disconnect, cache flush, client destruction, and exit.
- Every persisted guild operation is scoped to the owning guild and guarded against concurrent mutation.
- Startup must not overwrite a newer settings file with an older shard cache.

### Interaction and authorization boundary

All component custom IDs pass through one parser. The parser identifies action, guild, user/resource owner, and resource identifier. The handler then verifies:

- the interaction belongs to the stated guild and resource;
- the user owns user-scoped resources;
- the member satisfies voice-channel requirements;
- the member satisfies DJ, administrator, or command-restriction policy.

Slash commands and buttons use the same permission policy. Settings confirmation buttons recheck `ManageGuild`; playback controls use the same-voice and playback-management checks as their command equivalents.

### Session lifecycle

Sessions distinguish three operations:

- `stop`: clear playback state and intentionally discard the session;
- `disconnect`: leave voice while preserving the recoverable session;
- `shutdown`: disconnect and flush durable state without deleting recoverable sessions.

A successful ready path restores eligible session metadata and reattaches only safe, valid state. Invalid or stale snapshots are quarantined or discarded with a bounded error log.

### Integration boundaries

- Spotify OAuth uses Authorization Code with PKCE, refresh, revoke, and user-scoped token files.
- Token files use restrictive filesystem permissions and never appear in logs or error messages. Encryption at rest is outside this delivery unless a key-management design is approved.
- Last.fm uses a dedicated client with deterministic signing tests and scrobble eligibility rules.
- Radio selection is a small service independent of Lavalink player lifecycle.
- Music logging is append-only and bounded; logging failures never interrupt playback.
- External services are called through injectable clients so local tests use fixtures and no secrets.

## TDD workflow

Every production change follows this gate:

1. Write one focused test describing observable behavior.
2. Run the targeted test and confirm the expected failure.
3. Implement the smallest production change that makes the test pass.
4. Run the targeted test and confirm it passes.
5. Run the full `npm test` suite.
6. Refactor only while green.
7. Run repository verification and update the applicable DOX documentation and knowledge graph.

For a bug, the first test must reproduce the user-visible flow as closely as practical. A unit test alone is insufficient for a command, component, shard, or persistence regression; add an integration-style test at the relevant boundary.

## Phase plan

This is the program-level design. Each phase receives its own executable implementation plan and approval checkpoint before code changes begin; Phase 5 may be split into integration subplans if its external contracts become too large for one cycle.

### Phase 0 - Baseline and reproducible failures

- Add shared test fixtures and lightweight Discord/Shoukaku doubles only where real code cannot be exercised directly.
- Record the current command inventory, test inventory, and verification commands.
- Add failing reproductions for `/playnext`, `/forcefix`, component custom-ID routing, button authorization, guild command sync, and shard shutdown.
- Add a static contract check for command loading, configuration, and data-path resolution.
- Do not change production behavior in this phase.

**Exit criteria:** Each known blocker has a deterministic failing test and a recorded failure reason.

### Phase 1 - Playback and queue correctness

- Correct `/playnext` argument handling and idle-start behavior.
- Make `/forcefix` preserve order, reconnect, and resume playback.
- Attach requester metadata consistently at every enqueue path.
- Enforce voice-session locks consistently.
- Resolve the documented filter-stacking versus replacement contract and test the chosen behavior.
- Cover queue, loop, seek, volume, stop, disconnect, and track-end transitions.

**Exit criteria:** Core playback regressions are green and the manual playback smoke flow passes where a live guild is available.

### Phase 2 - Permissions and components

- Replace global custom-ID assumptions with the central parser.
- Add resource ownership and permission checks to all buttons.
- Apply command restrictions consistently instead of only to six commands.
- Resolve `controlMode`, `djModeEnabled`, and DJ-role semantics.
- Make settings, panel, playlist, liked, lyrics, and vote-skip interactions use the correct interaction lifecycle.
- Standardize Components V2 and error responses.

**Exit criteria:** Unauthorized controls are rejected, authorized controls work, and every supported custom-ID family has a routing test.

### Phase 3 - Persistence and sharding

- Route all persistence through `dataPath()`.
- Add per-guild/per-user stores with atomic writes and migration coverage.
- Implement session restore and distinguish stop, disconnect, and shutdown semantics.
- Make command deployment leader-owned for global scope and correct for each guild scope.
- Implement typed shard IPC and verify graceful shutdown without timeout force-kill.
- Add contention, restart, corruption, and migration tests.

**Exit criteria:** Restart and shard tests preserve expected state, and a single host can run the documented number of shards safely.

### Phase 4 - Playlists and liked songs

- Complete canonical playlist actions: `create`, `delete`, `list`, `view`, `play`, `add`, `remove`, `save`, `cover`, `import`, `addnowplaying`, `savequeue`, and `setcover`.
- Preserve `/playlists` and existing aliases.
- Store and validate default-playlist ownership.
- Implement intended 24/7 and queue-empty auto-loading.
- Complete liked-song and playlist pagination with safe stale-interaction handling.
- Add store, command, ownership, limit, and restart tests.

**Exit criteria:** The full Phase 4 manual flow passes and all planned Phase 4 store tests exist.

### Phase 5 - Integrations and utilities

- Implement Spotify account linking and playlist/artist/album search commands.
- Implement Last.fm login, verification, logout, scrobble, and status commands.
- Implement external/custom radio configuration and next-track behavior.
- Implement bounded music logging and top-song/log query commands.
- Implement music info, prune, tutorial/start, premium, and music-guesser utilities from the approved full roadmap.
- Add local fixture tests and credential-gated optional live smoke tests.

**Exit criteria:** Integrations work against deterministic fakes, secrets never enter logs, and playback is unaffected by integration failures.

### Phase 6 - Production hardening

- Add CI execution for tests and available static checks.
- Verify Dockerfile, Compose, supervisor, and Lavalink readiness paths.
- Verify plugin artifact integrity.
- Align README, environment examples, implementation plans, test runbooks, and technical-foundation documentation with actual behavior.
- Add operational checks for restart, persistence, memory, Lavalink health, and rollback.
- Run the complete manual regression plan and record results.

**Exit criteria:** The documented single-host deployment is reproducible, observable, secure within its stated boundaries, and supported by passing automated checks.

## Testing strategy

- Use Node's built-in test runner and existing project conventions.
- Keep pure helpers dependency-free and test them directly.
- Use temporary directories for storage tests and deterministic clocks/identifiers where needed.
- Use real production modules with small test doubles only at external boundaries.
- Test command data, execution behavior, interaction routing, permissions, and persistence separately.
- Do not treat the manual `TEST_PLAN_PHASES_1-4.md` as proof that tests pass; it is a runbook until executed.
- Add coverage reports only after behavioral coverage is meaningful.

## Rollout and safety

- Work in an isolated feature branch or worktree.
- Keep each phase independently revertible.
- Stop and report when a change requires a new dependency, a destructive migration, a live credential, or a product decision not covered by this design.
- Do not commit secrets, tokens, generated runtime data, or local logs.
- Do not claim completion without fresh verification evidence.

## Definition of done

A phase is complete only when its tests were observed failing before production changes, its targeted tests and full suite pass, applicable static checks pass, DOX documentation is current, the knowledge graph is updated, and relevant manual smoke checks are recorded. The final roadmap is complete only after all seven phases meet this standard.
