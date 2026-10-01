# src/events — Discord Event Handlers

## Purpose

Handlers for Discord gateway events (`ready`, `interactionCreate`, `voiceStateUpdate`, ...).

## Ownership

- All `events/*.js` files plus any new event handler

## Local Contracts

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
