# Auralyn Full Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved stability-first roadmap through Phase 6, with every production behavior change preceded by an observed failing behavioral test.

**Architecture:** Preserve the discord.js v14 + Shoukaku architecture, use a single-host sharded deployment, move state to independently owned atomic files, centralize component authorization, and isolate external integrations behind injectable clients. Each phase is a separately reviewable vertical slice; the next phase does not start until the current phase passes its exit criteria.

**Tech Stack:** Node.js 20+, ESM, built-in `node:test`, discord.js v14, Shoukaku v4, Lavalink v4, existing JSON stores, Docker, Java 17.

**Spec:** `docs/superpowers/specs/2026-09-24-auralyn-stabilization-and-full-roadmap-design.md`

## Global Constraints

- Write one focused behavioral test before each production change.
- Run the targeted test and confirm the expected failure before implementation.
- Run `npm test` after each green change and before closing a phase.
- Do not add a test framework, database, or runtime dependency without explicit approval.
- Keep all command and event modules ESM-compatible and preserve existing aliases unless a test-backed contract requires a migration.
- Keep Discord intents at the currently approved set unless a separately approved design change requires more.
- Use `dataPath()` for persisted paths and atomic writes for durable state.
- Never log tokens, passwords, or other secrets.
- Update applicable `AGENTS.md` files and run `graphify update .` after meaningful code changes.
- Do not commit unless explicitly requested by the user.

---

## Phase gates

### Phase 0 - Baseline and reproducible failures

Create the executable baseline plan at `docs/superpowers/plans/2026-09-24-auralyn-phase-0-baseline.md` and execute it before changing production behavior. The phase records the current test baseline and adds failing reproductions for the six highest-risk blockers.

### Phase 1 - Playback and queue correctness

After Phase 0 is green at the intended baseline, repair `/playnext`, `/forcefix`, requester metadata, voice locks, and filter semantics. The phase ends with playback and queue regression tests plus the available manual playback smoke flow.

### Phase 2 - Permissions and components

After Phase 1 is green, centralize custom-ID parsing and authorization, make command restrictions consistent, and repair all panel, settings, playlist, liked, lyrics, and vote-skip interactions. Every supported button family receives an authorization and routing test.

### Phase 3 - Persistence and sharding

After Phase 2 is green, migrate state to independently owned atomic files, restore sessions, distinguish stop/disconnect/shutdown, correct command synchronization, and implement typed shard IPC. The phase includes migration, contention, corruption, restart, and shutdown tests.

### Phase 4 - Playlists and liked songs

After Phase 3 is green, complete the approved playlist command contract, default-playlist ownership and auto-loading, liked-song and playlist pagination, limits, and restart behavior. The phase includes dedicated playlist-store and liked-store suites.

### Phase 5 - Integrations and utilities

After Phase 4 is green, implement Spotify OAuth, Last.fm, radio, music logging, and the approved utility commands. Every external client is tested with deterministic fixtures first; live checks are optional and credential-gated.

### Phase 6 - Production hardening

After Phase 5 is green, add CI checks, verify Docker/Compose/Lavalink operations, verify plugin integrity, reconcile all project documentation, and execute the complete manual regression runbook.

## Cross-phase verification

- [ ] Targeted RED test output is recorded before each implementation.
- [ ] Targeted GREEN test output is recorded after each implementation.
- [ ] Full `npm test` output is green at every phase boundary.
- [ ] Syntax/static checks available in the repository pass.
- [ ] `graphify update .` completes after code changes.
- [ ] DOX documentation has no stale phase status or contradictory local contract.
- [ ] No generated runtime data, credentials, or local logs are added to the change set.
