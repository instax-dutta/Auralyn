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
- `ready.js` restores sessions into logical state only; connecting to voice is the separate Lavalink-ready step. Background intervals it starts must be registered with a `TimerRegistry` published as `client.timerRegistry`, which unrefs them and lets shutdown cancel them. A bare `unref()`ed interval cannot be cancelled.
- `voiceStateUpdate.js` calls `MusicPlayer.disconnect()`, never `stop()`, when the bot's channel empties. An empty channel is a recoverable departure. `stop()` is the destructive operation: it clears the queue and the persisted session, so returning listeners would find nothing queued. Pinned by `test/voice-empty-channel.test.js`.


- Default export: `{ name, once?, async execute(...args, client, shoukaku) }`.
- Event names use discord.js `Events` constants, not raw strings.
- Registration is owned by the loader in `src/index.js` (`loadEvents`); handlers must NOT register listeners themselves.
- `client` and `shoukaku` are always the last two arguments passed by the loader.

## Work Guidance

- Keep handlers side-effect-light; delegate to `client.musicPlayer`, stores, or `client.telemetry`.
- Log through `client.logger` with the client's scoped logger.

## Verification

- `test/voice-empty-channel.test.js` drives the real gateway event shape and pins all five branches of `voiceStateUpdate.js`. Otherwise covered indirectly by boot (`npm test` still must pass) and by `src/index.js` loaders throwing on malformed event modules.

## Child DOX Index

- None (flat file set).
