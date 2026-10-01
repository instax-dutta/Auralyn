# src/commands — Slash Commands

## Purpose

Every user-facing slash command Auralyn exposes. One file per command; filename equals the command name.

## Ownership

- All `commands/*.js` files (play, skip, queue, settings, dj, filters, liked/playlist management, etc.)
- Registering new commands and keeping their behavior consistent with the rest of the bot

## Local Contracts

- Default export: `{ data: SlashCommandBuilder, async execute(interaction, client, shoukaku) }`.
- `execute` is async; call `interaction.deferReply()` before any long work; respond via `editReply` and embed builders only.
- Voice commands must validate the member is in a voice channel AND the bot's voice-session lock (bot already in a different channel → reject). Use `buildActionFeedback` from `utils/music-ui.js` for rejections.
- Permission/DJ checks go through `utils/permissions.js`; strict DJ mode comes from `client.config`.
- All playback and queue mutations go through `client.musicPlayer` (`music/`); never touch raw Shoukaku players from commands.
- Track metadata (`requestedByUserId`, `requestedByName`) is attached to tracks at enqueue time.
- Command names are lowercase, single words, no spaces.

## Work Guidance

- Reuse embed builders from `utils/music-ui.js` and `utils/embeds.js`; do not hand-roll new embed styles.
- Keep command files small; move shared logic to `utils/` instead of duplicating.

## Verification

- `test/commands-load.test.js` — every command file exports `data` and `execute` and registers under `data.name`; part of `npm test`.

## Child DOX Index

- None (flat file set).
