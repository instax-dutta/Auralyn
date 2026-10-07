# Auralyn — Full Implementation Plan (Phases 1–5)

## Current State (as of last session)

- **Phase 1**: DONE — 13 new commands, /skip amount, /queue subcommands, time-parser.js
- **Phase 2**: DONE — 12 new filter presets, 4 shortcut commands (/nightcore /8d /bassboost /karaoke), smart stacking, conflict rules, solo presets, balanced as default, volume 80, JVM tuning
- **Phase 3**: DONE — DJ system, settings, restrictions, music panel, announce, VC status, forcefix, debug, switchaudionode
- **Phase 4**: NOT STARTED
- **Phase 5**: NOT STARTED

Total commands shipped: 58 (was 28 before Phase 1)
Tests passing: 48

---

## Hard Constraints (every phase)

1. ES Modules only. No `require`.
2. No new npm packages. Stack: `discord.js ^14`, `shoukaku ^4`, `dotenv ^16`, Node built-ins.
3. Do not touch `Dockerfile`, `docker-compose.yml`, `egg/*`, `package-lock.json`.
4. `scripts/start.sh` and `lavalink/application.yml` are touchable (already modified in Phase 2).
5. Intents stay `Guilds` + `GuildVoiceStates` only.
6. Components V2 everywhere — `MessageFlags.IsComponentsV2`.
7. Every command: `deferReply()` first, `try/catch` body, `buildActionFeedback` on error.
8. All existing commands must keep working after every phase.

## Canonical Command Shape

```js
// src/commands/example.js
import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder().setName('example').setDescription('...'),
  async execute(interaction, client /* , shoukaku */) {
    await interaction.deferReply();
    try {
      // logic
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Done');
    } catch (err) {
      client.logger.error('Error in /example', err);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
```

Key facts:
- `client.musicPlayer` (NOT `client.music`)
- Guild settings: `await client.musicPlayer.settingsStore.get(guildId)` / `.update(guildId, partial)`
- `djRoleIds: []` plural — used by `hasDjRole(member, settings)` in permissions.js
- `requireVoice`, `requireDjOrAdmin`, `hasDjRole` in `src/utils/permissions.js`
- Reply helpers in `src/utils/music-ui.js`: `buildActionFeedback`, `buildSimpleV2`, `replyWithPlayerSnapshot`, `buildQueueReply`
- Colors: `AuralynColors` from `src/utils/embeds.js`
- Button customId pattern: `auralyn:ACTION:guildId` (see interactionCreate.js)
- `setFilter` now returns `{ ok, preset }` or `{ ok: false, reason }` — check result in all callers
- `DEFAULT_FILTER = 'balanced'` (not flat) — new sessions start on balanced automatically

---

## Phase 3 — DJ System, Settings & Voice Channel Status

### Settings fields to ADD to default shape in `src/utils/guild-settings.js`

Add to `defaultGuildSettings` object and `sanitizeSettings()`:
```js
announceTracks: false,
announceChannelId: null,
vcStatusEnabled: false,
commandRestrictions: {},    // { [cmdName]: { channelId?: string, djOnly?: boolean } }
musicPanelChannelId: null,
musicPanelMessageId: null,
activeFilterName: null,     // track currently active filter name
defaultPlaylist: null,      // used in Phase 4 + 24/7 mode
radioMode: false,           // used in Phase 5
radioConfig: null,          // used in Phase 5
lastfmScrobble: false,      // used in Phase 5
djModeEnabled: false,
```

### New utility in `src/utils/permissions.js`

```js
export async function getCommandRestriction(settingsStore, guildId, commandName) {
  const settings = await settingsStore.get(guildId);
  return settings.commandRestrictions?.[commandName] ?? null;
}
```

### Wire restriction check into existing commands

Add after `deferReply` in: `skip.js`, `clear.js`, `stop.js`, `volume.js`, `seek.js`, `filter.js`:
```js
const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, '<cmdname>');
if (restriction?.djOnly) {
  const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
  const djCheck = requireDjOrAdmin(interaction, settings);
  if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
}
if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
  return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
}
```

### New commands (13)

| File | Slash | Guard | Logic |
|---|---|---|---|
| `setdj.js` | `/setdj <role:Role>` | ManageGuild | Append `role.id` to `djRoleIds` (de-dupe) |
| `unsetdj.js` | `/unsetdj <role:Role>` | ManageGuild | Filter `role.id` out of `djRoleIds` |
| `dj.js` | `/dj <enable\|disable>` | ManageGuild | Toggle `djModeEnabled`. Warn if enabling with empty `djRoleIds` |
| `djcommands.js` | `/djcommands` | none | List entries in `commandRestrictions` where `djOnly === true` |
| `restrict.js` | `/restrict <command> [channel] [dj_only]` | ManageGuild | `client.commands.has(command)` validate, merge into `commandRestrictions[name]` |
| `settings.js` | `/settings [view\|reset]` | ManageGuild | view: Components V2 list of all fields. reset: confirm button → restore defaults |
| `defaultvolume.js` | `/defaultvolume <0-100>` | ManageGuild | Update setting + `player.setVolume(guildId, vol)` if player active |
| `musicpanel.js` | `/musicpanel [channel]` | ManageGuild | Post persistent V2 message with 5 buttons. Save channelId+messageId to settings. Wire `panel_prev/pause/skip/loop/stop` in interactionCreate.js |
| `announce.js` | `/announce [enabled] [channel]` | ManageGuild | Toggle `announceTracks` + `announceChannelId`. Hook into player.playNext after playTrack |
| `voicechannelstatus.js` | `/voicechannelstatus [enabled]` | ManageGuild | Toggle `vcStatusEnabled`. Use raw REST: `client.rest.put('/channels/${vcId}/voice-status', { body: { status: title } })`. Wrap in try/catch (403 on free tier). Clear on stop/disconnect |
| `forcefix.js` | `/forcefix` | requireDjOrAdmin | Snapshot queue + currentTrack → player.stop → re-enqueue snapshot |
| `debug.js` | `/debug` | ManageGuild + ephemeral | shard info, shoukaku node stats, filterLayers, queue length, settings |
| `switchaudionode.js` | `/switchaudionode` | requireDjOrAdmin | List nodes. If 1 → "no alternate nodes". If 2+ → move via player.moveNode |

### Modifications to existing files

- `src/events/interactionCreate.js` — add handlers for `panel_prev`, `panel_pause`, `panel_skip`, `panel_loop`, `panel_stop`, `settings-reset`, `settings-cancel`
- `src/music/player.js` — add announce hook in `playNext` after `playTrack` succeeds; add VC status update helper; clear VC status in `stop()`/`disconnect()`

### Phase 3 verification

```bash
node --check src/commands/*.js src/utils/permissions.js src/utils/guild-settings.js
npm test  # 48+ pass
node src/deploy-commands.js  # dev guild first

# Manual:
# /setdj @role → /dj enable → /restrict skip dj_only:true → non-DJ /skip = Permission Denied
# /settings view → shows all fields
# /musicpanel → persistent panel posted + buttons work
# /announce enabled:true channel:#ch → track announcements appear there
# /voicechannelstatus enabled:true → VC name shows track (or 403 on free tier, no crash)
# /forcefix → reconnects cleanly, queue restored
```

---

## Phase 4 — Playlists & Liked Songs

### New utility first: `src/utils/data-dir.js`

```js
import path from 'node:path';
const ROOT = process.env.DATA_DIR ?? '/app/data';
export function dataPath(...segments) { return path.join(ROOT, ...segments); }
```

All Phase 4+ stores use `dataPath(...)` for paths. Existing stores (`guild-settings.js`, `spotify-yt-cache.js`) stay hardcoded — don't migrate them.

### New store: `src/utils/playlist-store.js`

- Path: `dataPath('playlists', '${userId}.json')`
- Schema: `{ playlists: { [name]: { name, coverUrl, createdAt, tracks: Track[] } } }`
- API: `getPlaylists`, `createPlaylist`, `deletePlaylist`, `addTrackToPlaylist`, `removeTrackFromPlaylist`, `setPlaylistCover`, `saveQueueToPlaylist`
- Limits: `PLAYLIST_MAX_COUNT` env (default 25), `PLAYLIST_MAX_TRACKS` env (default 500)
- Pattern: async, mkdir+writeFile, pretty-printed JSON (mirror session-store.js)

### New store: `src/utils/liked-store.js`

- Path: `dataPath('liked', '${userId}.json')`
- Schema: `{ songs: [{ encoded, title, uri, duration, addedAt }] }`
- API: `getLikedSongs`, `likeTrack` (idempotent, returns false if already liked), `unlikeTrack`, `clearLikedSongs`, `sortLikedSongs(userId, key)` — key ∈ `title|duration|date_added`

### New commands (11)

| File | Slash | Notes |
|---|---|---|
| `playlist.js` | `/playlist <sub>` | Subcommands: `create/delete/play/view/list/addtrack/removetrack/addnowplaying/savequeue/import/setcover`. `view` paginates 10/page (customId: `pl:page:userId:name:idx`). `import` accepts Spotify/YT URL via existing `resolveTrack` |
| `playlists.js` | `/playlists` | Delegates to `/playlist list` handler |
| `defaultplaylist.js` | `/defaultplaylist <name>` | ManageGuild. Stores in `settings.defaultPlaylist`. In player.playNext empty-queue branch: if `twentyFourSeven && defaultPlaylist`, auto-load playlist |
| `like.js` | `/like` | `likeTrack(userId, currentTrack)` |
| `dislike.js` | `/dislike` | `unlikeTrack(userId, currentTrack.info.uri)` |
| `liked.js` | `/liked [page=1]` | Paginate 10/page. Buttons `liked:page:userId:idx` |
| `showliked.js` | `/showliked` | Delegates to `/liked page:1` |
| `playliked.js` | `/playliked [shuffle=false]` | Load liked songs, optional Fisher-Yates shuffle, `enqueuePlaylist` |
| `clearliked.js` | `/clearliked` | Confirm/cancel buttons (15s timeout): `liked:clear:confirm:userId` / `liked:clear:cancel:userId` |
| `sortliked.js` | `/sortliked <title\|duration\|date_added>` | Calls `sortLikedSongs(userId, key)` |

### Modifications

- `player.playNext` empty-queue branch: check `settings.defaultPlaylist` before `state.autoplay`
- `interactionCreate.js`: register `pl:` and `liked:` customId families

### Phase 4 verification

```bash
npm test  # playlist-store.test.js + liked-store.test.js — CRUD, limits, idempotent like
# Manual: /playlist create mylist → /like (while playing) → /playlist addnowplaying mylist
# Queue 5 tracks → /playlist savequeue mylist → restart bot → /playlist play mylist
```

---

## Phase 5 — Integrations & Utilities

### New modules

**`src/utils/spotify-oauth.js`** — Authorization Code + PKCE (per-user Spotify account linking)
- `generateAuthUrl(userId)` → returns Spotify OAuth URL, stores PKCE verifier in memory map
- `exchangeCode(state, code)` → POST /api/token, persist `{ accessToken, refreshToken, expiresAt }` to `dataPath('spotify-tokens', '${userId}.json')`
- `getAccessToken(userId)` → refresh if `Date.now() > expiresAt - 30000`, return token
- `revokeToken(userId)` → delete token file
- Redirect URI: `process.env.SPOTIFY_REDIRECT_URI` — document in `.env.example`
- Note: Client Credentials flow already exists in `spotify-resolver.js` — do NOT duplicate

**`src/utils/lastfm-client.js`**
- `generateToken()` → GET `auth.getToken`, return `{ token, authUrl }`
- `getSession(userId, token)` → GET `auth.getSession`, persist `{ sessionKey, username }` to `dataPath('lastfm', '${userId}.json')`
- `updateNowPlaying(userId, track)` → POST `track.updateNowPlaying`
- `scrobble(userId, track, playedAt)` → POST `track.scrobble`. Only if: >30s played AND (>50% of length OR >4min)
- `signParams(params, secret)` — md5(sorted key+value concat + secret)
- Env vars: `LASTFM_API_KEY`, `LASTFM_API_SECRET`

**`src/utils/radio-store.js`** — thin wrapper on guild settings
- `getRadioConfig(guildId)`, `setRadioConfig(guildId, config)`, `clearRadioConfig(guildId)`
- Config shape: `{ mode: 'external'|'playlist', url?, playlistName?, shuffle: boolean }`

**`src/utils/music-logger.js`** — append-only JSONL
- `dataPath('logs', '${guildId}.jsonl')`
- `logEvent(guildId, { action, trackTitle, trackUri, userId, ts })` → `fs.appendFile`
- `readEvents(guildId, { offset, limit })` → for pagination

### New commands (~18)

**Spotify (8):**
- `/spotify` — linked account status
- `/spotify-login` — ephemeral auth URL
- `/spotify-connect <code> <state>` — exchange code
- `/spotify-logout` — revoke token
- `/spotify-playlists` — GET /v1/me/playlists (user token)
- `/searchplaylist <query>` — GET /v1/search?type=playlist (Client Credentials)
- `/searchartist <query>` — same, type=artist
- `/searchalbum <query>` — same, type=album

**Last.fm (1 with subcommands):**
- `/lastfm <login|verify|logout|scrobble|status>`
  - login: DM auth URL
  - verify `<token>`: `getSession(userId, token)`
  - scrobble `<on|off>`: toggle `settings.lastfmScrobble`
  - status: show linked account + toggle state

**Radio (1 with subcommands):**
- `/radio <external|custom|shuffle|disable|status>`
  - external `<url>`: HEAD validate, `setRadioConfig`
  - custom `<playlist>`: verify playlist exists, `setRadioConfig`
  - shuffle `<on|off>`: toggle `radioConfig.shuffle`
  - disable: `clearRadioConfig`
  - status: show current config

**Utilities (7):**
- `/top-songs [day|week|month|all]` — reads music-logger, aggregate by trackUri, top 10
- `/music-info <query>` — `node.rest.resolve(query)` without enqueue, show metadata
- `/music-logs [page=1]` — paginate `readEvents`, ManageGuild
- `/prune [limit=50 max=100]` — ManageMessages guard, `channel.bulkDelete` bot messages
- `/start` — 5-page tutorial via Components V2 buttons (`start:page:userId:idx`)
- `/premium` — static `buildSimpleV2` embed with support/invite links
- `/music-guesser [rounds=3 max=10]` — random track clip, 4 button choices, 30s collect via `awaitMessageComponent`

### Modifications

- `player.handleTrackEnd`: if `settings.lastfmScrobble`, call `scrobble`. Also `music-logger.logEvent`. Both in try/catch — never fail playback.
- `player.playNext` empty-queue branch: if `settings.radioMode`, dispatch to radioStore next-track BEFORE `state.autoplay`
- `interactionCreate.js`: register `start:`, `mg:` customId families

### Phase 5 verification

```bash
npm test  # lastfm-client.test.js (sign deterministic), music-logger.test.js (append+paginate), radio-store.test.js
# Manual: /spotify-login flow round-trip
# /lastfm login + verify → play track → scrobble lands on Last.fm
# /music-guesser rounds:1 → clip plays, button click resolves win/lose
# /prune → only bot messages deleted
```

---

## End-of-Phase Checklist

```bash
node --check src/commands/*.js src/utils/*.js
npm test
GUILD_ID=<dev-guild> node src/deploy-commands.js

# Regression smoke:
# /play /skip /stop /queue /loop /filter /lyrics must work unchanged
# /filter flat resets all layers
# /filter 8d + /filter nightcore = both active (stacking)
# /filter terriblebass = solo (resets everything first)
```

---

## Summary Table

| Phase | Status | New cmds | Key files |
|---|---|---|---|
| 1 | ✅ DONE | 13 | join disconnect replay forward rewind forceskip bump leavecleanup removedupes playtop playskip sleeptimer grab + modified: skip queue |
| 2 | ✅ DONE | 4 | nightcore 8d bassboost karaoke + 12 new presets in audio-filters.js |
| 3 | ⏳ NEXT | 13 | setdj unsetdj dj djcommands restrict settings defaultvolume musicpanel announce voicechannelstatus forcefix debug switchaudionode |
| 4 | ⏳ | 11 | playlist playlists defaultplaylist like dislike liked showliked playliked clearliked sortliked + playlist-store.js liked-store.js |
| 5 | ⏳ | ~18 | spotify* lastfm radio top-songs music-info music-logs prune start premium music-guesser + spotify-oauth.js lastfm-client.js radio-store.js music-logger.js |
