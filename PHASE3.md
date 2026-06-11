# Phase 3 — DJ System, Settings & Voice Channel Status

## Status: NOT STARTED

## Context

Phases 1 (13 new commands + queue subcommands) and 2 (12 new filter presets + 4 shortcut
commands + smart stacking) are shipped and tested. Phase 3 adds per-guild configuration,
a DJ role system, a persistent music panel, and voice channel status updates.

## Hard Constraints (same as all phases)

- ES Modules only. No `require`.
- No new npm packages.
- `export default { data, execute }` on every command (loader at `src/index.js:101-105`).
- `client.musicPlayer` (not `client.music`).
- Guild settings: `await client.musicPlayer.settingsStore.get(guildId)` / `.update(guildId, partial)` — async.
- Existing `djRoleIds: []` plural array field. Do NOT invent singular `djRoleId`.
- `requireVoice`, `requireDjOrAdmin`, `hasDjRole`, `requireSameVoiceChannel` in `src/utils/permissions.js`.
- Reply helpers in `src/utils/music-ui.js`: `buildActionFeedback`, `buildSimpleV2`, `replyWithPlayerSnapshot`.
- Components V2 everywhere — `MessageFlags.IsComponentsV2`.
- Never break existing 41 commands.

## Existing API to Know Before Starting

### guild-settings.js (`src/utils/guild-settings.js`)

Current default shape:
```js
{
  defaultVolume: 80,          // already updated in Phase 2
  autoplay: false,
  inactivityTimeoutMs: 120000,
  djRoleIds: [],              // plural — used by hasDjRole()
  sourcePriority: ['direct', 'youtube'],
  controlMode: 'public',      // 'public' | 'dj' | 'locked'
  twentyFourSeven: false,
  voteSkipEnabled: false,
  voteSkipThreshold: 50,
}
```

Settings store accessed via `client.musicPlayer.settingsStore` (wired in `src/index.js`).

### permissions.js (`src/utils/permissions.js`)

- `hasDjRole(member, settings)` → bool. Uses `settings.djRoleIds`.
- `requireDjOrAdmin(interaction, settings)` → `{ allowed, reply }`.
- `requireVoice(interaction)` → `{ allowed, reply }`.
- `isAdminLikeMember(member)` → bool.

### interactionCreate.js (`src/events/interactionCreate.js`)

Button customId routing uses `auralyn:ACTION:guildId` pattern split by `:`.
Currently handles: `skip`, `pause`, `resume`, `loop`, `stop`.
New panel buttons must follow the same scheme.

## Settings Fields to Add

Add these to the default shape in `src/utils/guild-settings.js` (safe defaults, auto-merged):

```js
announceTracks: false,          // send announce message on track start
announceChannelId: null,        // string | null — channel for announcements
vcStatusEnabled: false,         // update VC status with current track name
commandRestrictions: {},        // { [commandName]: { channelId?, djOnly? } }
musicPanelChannelId: null,      // string | null
musicPanelMessageId: null,      // string | null
activeFilterName: null,         // string | null — shown in /settings view
defaultPlaylist: null,          // string | null — used by 24/7 + Phase 4
radioMode: false,               // used by Phase 5
radioConfig: null,              // used by Phase 5
lastfmScrobble: false,          // used by Phase 5
djModeEnabled: false,           // when false, all controlMode checks still apply
                                // when true + djRoleIds empty → warn user
```

Add to `sanitizeSettings()` in same file.

## New Utility Function

Add to `src/utils/permissions.js`:

```js
// Returns null if no restriction, or { channelId?, djOnly? } if restricted.
export async function getCommandRestriction(settingsStore, guildId, commandName) {
  const settings = await settingsStore.get(guildId);
  return settings.commandRestrictions?.[commandName] ?? null;
}
```

Wire restriction check into the following existing commands (after `deferReply`, before main logic):
- `src/commands/skip.js`
- `src/commands/clear.js`
- `src/commands/stop.js`
- `src/commands/volume.js`
- `src/commands/seek.js`
- `src/commands/filter.js`

Pattern to add at top of each `execute`:
```js
const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, 'commandname');
if (restriction?.djOnly) {
  const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
  const djCheck = requireDjOrAdmin(interaction, settings);
  if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
}
if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
  return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
}
```

## New Commands (13)

All files go in `src/commands/`. Follow canonical template.

### `/setdj <role:Role>`
File: `src/commands/setdj.js`
Guard: `ManageGuild` permission (`PermissionFlagsBits.ManageGuild`).
Logic: append `role.id` to `djRoleIds` array (de-dupe). Reply confirmation.

### `/unsetdj <role:Role>`
File: `src/commands/unsetdj.js`
Guard: `ManageGuild`.
Logic: filter `role.id` out of `djRoleIds`. Reply confirmation.

### `/dj <mode: enable|disable>`
File: `src/commands/dj.js`
Guard: `ManageGuild`.
Logic: toggle `djModeEnabled`. If enabling with empty `djRoleIds`, warn: "No DJ role set. Use `/setdj` to assign one."

### `/djcommands`
File: `src/commands/djcommands.js`
No guard.
Logic: read `commandRestrictions`, filter where `djOnly === true`, display as embed list.

### `/restrict <command:string> [channel:Channel] [dj_only:boolean]`
File: `src/commands/restrict.js`
Guard: `ManageGuild`.
Logic: validate `command` exists via `client.commands.has(command)`. Merge into `commandRestrictions[command]`.

### `/settings [action: view|reset]`
File: `src/commands/settings.js`
Guard: `ManageGuild`.
Logic:
- `view` (default): render all settings fields as Components V2 text list.
- `reset`: show confirm/cancel buttons (`auralyn:settings-reset:guildId` / `auralyn:settings-cancel:guildId`). On confirm: call `settingsStore.update(guildId, defaultGuildSettings)`.
Wire confirm/cancel in `src/events/interactionCreate.js`.

### `/defaultvolume <volume:int 0-100>`
File: `src/commands/defaultvolume.js`
Guard: `ManageGuild`.
Logic: `settingsStore.update(guildId, { defaultVolume: volume })`. If player active: `client.musicPlayer.setVolume(guildId, volume)` for immediate effect.

### `/musicpanel [channel:Channel]`
File: `src/commands/musicpanel.js`
Guard: `ManageGuild`.
Logic: target = provided channel or current channel. Post Components V2 message with 5 buttons:
- `auralyn:panel_prev:guildId` — Previous
- `auralyn:panel_pause:guildId` — Pause/Resume (dynamic label)
- `auralyn:panel_skip:guildId` — Skip
- `auralyn:panel_loop:guildId` — Loop
- `auralyn:panel_stop:guildId` — Stop
Save `musicPanelChannelId` + `musicPanelMessageId` to settings.
Add handlers for these customIds in `src/events/interactionCreate.js` — dispatch to existing player methods. Reuse existing `skip/pause/resume/loop/stop` handler logic.

### `/announce [enabled:boolean] [channel:Channel]`
File: `src/commands/announce.js`
Guard: `ManageGuild`.
Logic: toggle `announceTracks` + optionally set `announceChannelId`.
Hook in `src/music/player.js` `playNext` (after `playTrack` succeeds): if `announceTracks && announceChannelId && announceChannelId !== state.textChannel?.id`, send announce to that channel. Wrap in try/catch — never fail playback.

### `/voicechannelstatus [enabled:boolean]`
File: `src/commands/voicechannelstatus.js`
Guard: `ManageGuild`.
Logic: toggle `vcStatusEnabled`.
Hook in `src/music/player.js` `playNext` after track starts: if `vcStatusEnabled`, call raw REST:
```js
await client.rest.put(`/channels/${voiceChannelId}/voice-status`, { body: { status: trackTitle } });
```
On `stop`/`disconnect`: clear status with `{ status: '' }`.
Wrap in try/catch — Discord returns 403 if VC status not available for the server tier. No crash.
**Note:** `VoiceChannel#setStatus` not in discord.js v14.26.4 typings — must use raw REST.

### `/forcefix`
File: `src/commands/forcefix.js`
Guard: `requireDjOrAdmin`.
Logic: capture `state.queue` snapshot + `state.currentTrack`. Call `client.musicPlayer.stop(guildId)`. Re-enqueue current track + queue. Reply with count restored.

### `/debug`
File: `src/commands/debug.js`
Guard: `ManageGuild`. Ephemeral reply.
Logic: build embed showing:
- `client.shardInfo.ids` + `client.shardInfo.count`
- Shoukaku node stats: `client.shoukaku.nodes` (name, connected, stats.players, stats.playingPlayers)
- Current filter layers: `state.filterLayers`
- Queue length + current track title
- Guild settings summary (no secrets)

### `/switchaudionode`
File: `src/commands/switchaudionode.js`
Guard: `requireDjOrAdmin`.
Logic: list `client.shoukaku.nodes`. If only 1, reply "No alternate nodes configured." If 2+: show picker or auto-pick least-loaded alternate via `player.moveNode(targetNode)`.

## Verification After Phase 3

```bash
# 1. Syntax
node --check src/commands/*.js src/utils/permissions.js src/utils/guild-settings.js

# 2. Tests
npm test  # all 48 baseline tests must pass; add new ones for getCommandRestriction

# 3. Deploy
GUILD_ID=<dev-guild> node src/deploy-commands.js

# 4. Manual
/setdj @role  →  role added to djRoleIds
/dj enable    →  djModeEnabled true
/restrict skip dj_only:true  →  non-DJ /skip returns Permission Denied
/settings view  →  all fields shown
/musicpanel  →  persistent panel posted, buttons work
/announce enabled:true channel:#now-playing  →  track announcements post there
/voicechannelstatus enabled:true  →  VC shows track name (or 403 on free tier)
/forcefix  →  disconnects and re-queues cleanly
/debug  →  shard + node stats visible
```

## Phase 4 Preview (after Phase 3 done)

- Per-user playlists: `src/utils/playlist-store.js` + `/playlist` command (12 subcommands)
- Liked songs: `src/utils/liked-store.js` + `/like`, `/dislike`, `/liked`, `/playliked`, etc.
- `src/utils/data-dir.js`: `dataPath(...segments)` using `process.env.DATA_DIR ?? '/app/data'`
- Default playlist auto-load in 24/7 mode

## Phase 5 Preview (after Phase 4 done)

- Spotify user OAuth (`src/utils/spotify-oauth.js`)
- Last.fm scrobbling (`src/utils/lastfm-client.js`)
- Radio mode (`src/utils/radio-store.js`)
- Music logger (`src/utils/music-logger.js`)
- Utility commands: `/top-songs`, `/music-info`, `/music-logs`, `/prune`, `/start`, `/premium`, `/music-guesser`
