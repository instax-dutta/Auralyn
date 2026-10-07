# src/events — Discord Event Handlers

## Purpose

Handlers for Discord gateway events (`ready`, `interactionCreate`, `voiceStateUpdate`, ...).

## Ownership

- All `events/*.js` files plus any new event handler

## Local Contracts

- `interactionCreate.js` MUST parse component custom IDs with `parseCustomId()` from `utils/interaction-ids.js`. Never destructure or index-split a custom ID: playlist names may contain `:`, so fixed indices shift and silently corrupt fields.
- Command restrictions from `/restrict` are enforced ONCE in the chat-input dispatcher, before `command.execute`. Individual commands may repeat the check but must not be the only enforcement point, or a new command silently opts out.
- The four user-scoped families (`playlist-page`, `liked-page`, `liked-clear`, `voteskip`) carry a user id instead of a guild id and must be exempt from the guild-ownership gate.
- Always reply (never `deferUpdate`) when rejecting a cross-guild or cross-user control; the caller has not been deferred.
- `voiceStateUpdate` calls `MusicPlayer.disconnect()` when a channel empties, never `stop()`. An empty channel is a recoverable departure and must not destroy the queue.
- `ready.js` restores sessions into logical state only; connecting to voice is the separate Lavalink-ready step. Background intervals it starts must be `unref()`ed so they never hold the process open.


- Default export: `{ name, once?, async execute(...args, client, shoukaku) }`.
- Event names use discord.js `Events` constants, not raw strings.
- Registration is owned by the loader in `src/index.js` (`loadEvents`); handlers must NOT register listeners themselves.
- `client` and `shoukaku` are always the last two arguments passed by the loader.

## Work Guidance

- Keep handlers side-effect-light; delegate to `client.musicPlayer`, stores, or `client.telemetry`.
- Log through `client.logger` with the client's scoped logger.

## Verification

- No dedicated unit suite; covered indirectly by boot (`npm test` still must pass) and by `src/index.js` loaders throwing on malformed event modules.

## Child DOX Index

- None (flat file set).
