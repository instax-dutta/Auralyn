# Auralyn Test Plan — Complete (Phases 1-4)

Two testers: **Admin** (you, with Manage Server) + **Member** (friend, no special perms).

---

## Setup (Admin, 2 min)

1. `/setdj role:@SomeRole` — add a DJ role
2. `/dj mode:enable` — turn on DJ mode
3. Assign the DJ role to yourself (Admin), **not** to Member

---

## Core Playback & Queue (Both, 5 min)

| Who | Command | Expected |
|-----|---------|----------|
| Either | `/play Never Gonna Give You Up` | Joins VC, starts playing |
| Either | `/play Bohemian Rhapsody` (3× more songs) | 4 tracks total in queue |
| Either | `/queue` | Shows all 4 tracks |
| Either | `/skip amount:2` | Skips 2 tracks at once |
| Either | `/queue move from:2 to:1` | Track #2 moves to #1 |
| Either | `/queue remove position:1` | Removes track #1 |
| Either | `/queue shuffle` | Randomizes order |
| Either | `/pause` then `/resume` | Pauses/resumes |
| Either | `/loop` (press 3×) | Cycles: track → queue → off |
| Either | `/seek time:1:30` | Seeks to 1m30s |
| Either | `/volume volume:80` | Volume changes to 80% |
| Either | `/lyrics` | Shows lyrics (if available) |
| Either | `/previous` | Plays previous track from history |
| Either | `/nowplaying` | Shows current track with buttons |
| Either | Click Skip on now-playing | Skips track |
| Either | `/queue clear` | Empties queue |
| Either | `/stop` | Stops playback, leaves VC |

---

## Filters (Either, 3 min)

| Command | Expected |
|---------|----------|
| `/play <song>` | Start playback |
| `/filter preset:bass` | Bass boost applied |
| `/filter preset:nightcore` | **Only** nightcore now (no stacking) |
| `/nightcore` | Shortcut, same as above |
| `/8d` | 8D audio effect |
| `/bassboost` | Bass boost shortcut |
| `/karaoke` | Karaoke mode (vocals reduced) |
| `/filter preset:flat` | Back to balanced baseline |

---

## DJ System & Restrictions (Both, 5 min)

### DJ Mode
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/restrict command:skip dj_only:true` | Restriction set |
| Member | `/skip` | ❌ Permission Denied |
| Admin | `/skip` | ✅ Works |
| Admin | `/djcommands` | Lists skip as DJ-only |
| Admin | `/restrict command:skip dj_only:false` | Cleared |
| Member | `/skip` | ✅ Works now |

### Channel Restrictions
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/restrict command:volume channel:#bot-commands` | Set |
| Member | `/volume volume:50` in different channel | ❌ Wrong Channel |
| Member | `/volume volume:50` in `#bot-commands` | ✅ Works |
| Admin | `/restrict command:volume channel:` (empty) | Clears restriction |

### Settings
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/settings` | Shows all 12 fields |
| Admin | `/settings action:reset` → Cancel | No change |
| Admin | `/settings action:reset` → Confirm | Reset to defaults |
| Admin | `/defaultvolume volume:50` | Default set |
| Either | `/play <song>` | Starts at 50% |

### Music Panel
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/musicpanel` | Posts panel with 5 buttons |
| Either | Click Previous | Plays previous track |
| Either | Click Pause/Resume | Toggles pause |
| Either | Click Skip | Skips track |
| Either | Click Loop | Cycles loop mode |
| Either | Click Stop | Stops playback, panel updates |

### Announce & VC Status
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/announce enabled:true channel:#announcements` | Set |
| Either | `/play <song>` | Track announced in `#announcements` |
| Admin | `/announce enabled:false` | No more announcements |
| Admin | `/voicechannelstatus enabled:true` | Enabled |
| Either | `/play <song>` | VC status shows track title (or silent 403) |
| Admin | `/stop` | VC status clears |
| Admin | `/voicechannelstatus enabled:false` | Disabled |

### Utility
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/debug` | Ephemeral: shard, nodes, filters, queue |
| Admin | Queue 3 tracks, `/forcefix` | Restores queue, resumes |
| Admin | `/switchaudionode` | "No alternate nodes" (single-node setup) |

---

## Playlists & Liked Songs (Both, 8 min)

### Liked Songs Flow
| Who | Command | Expected |
|-----|---------|----------|
| Member | `/play Despacito` | Playing |
| Member | `/like` | "Added to your liked songs" |
| Member | `/like` again | "Already Liked" |
| Member | `/liked` | Shows 1 song |
| Member | `/dislike` | Removed from liked |
| Member | `/play <song>` then `/like` (5 times) | 5 liked songs |
| Member | `/liked page:1` | Shows first 10 (or all 5) |
| Member | `/showliked` | Alias for `/liked` |
| Member | `/sortliked by:title` | Sorted A-Z |
| Member | `/sortliked by:duration` | Sorted shortest first |
| Member | `/playliked shuffle:true` | Queues all 5, shuffled |
| Member | `/clearliked` → Cancel | Not cleared |
| Member | `/clearliked` → Confirm | All 5 removed |

### Playlist Flow
| Who | Command | Expected |
|-----|---------|----------|
| Admin | `/playlist create name:Workout` | Created |
| Admin | `/playlist create name:Workout` again | "Already exists" |
| Admin | `/play Shape of You` | Playing |
| Admin | `/playlist add name:Workout` | Track added |
| Admin | `/play Blinding Lights`, then add (2× more) | 3 tracks total |
| Admin | `/playlist view name:Workout` | Shows 3 tracks |
| Admin | Click Next button (if >10 tracks) | Page 2 |
| Admin | `/playlist remove name:Workout position:2` | Track #2 removed |
| Admin | `/playlist view name:Workout` | Now 2 tracks |
| Admin | `/playlist list` | Shows "Workout • 2 tracks" |
| Admin | `/playlists` | Alias for `/playlist list` |
| Admin | `/playlist play name:Workout shuffle:false` | Queues 2 tracks in order |
| Admin | `/queue` with 3 tracks playing | Current + 2 queued |
| Admin | `/playlist save name:Workout` | Adds 3 more (total 5) |
| Admin | `/playlist cover name:Workout url:https://i.imgur.com/example.jpg` | Cover set |
| Admin | `/defaultplaylist name:Workout` | Set as default (stub, not active yet) |
| Admin | `/playlist delete name:Workout` | Deleted |
| Admin | `/playlist list` | Empty now |

### Limits
| Who | Command | Expected |
|-----|---------|----------|
| Either | Create 25 playlists (script or loop) | All created |
| Either | `/playlist create name:26th` | "Playlist limit reached (25)" |
| Either | `/playlist delete name:one` | Deleted |
| Either | `/playlist create name:26th` | ✅ Now works |

---

## Search & Advanced (Either, 3 min)

| Command | Expected |
|---------|----------|
| `/search query:lofi hip hop` | Shows 10 results with buttons |
| Click button #3 | Track #3 queued |
| `/playnext <song>` | Adds to front of queue |
| `/playtop <song>` | Alias for playnext |
| `/playskip <song>` | Skips current, plays this next |
| `/autoplay enabled:true` | Autoplay on |
| Let queue empty | Autoplay fetches related track |
| `/autoplay enabled:false` | Off |

---

## Persistence (Admin, 2 min after bot restart)

1. `/setdj role:@DJ`, `/dj mode:enable`
2. `/announce enabled:true channel:#announcements`
3. `/defaultvolume volume:70`
4. `/like` a track, `/playlist create name:Test`, add 1 track
5. **Restart bot** (stop container, start again)
6. `/settings` → check DJ mode, announce, defaultVolume all preserved
7. `/liked` → your liked song still there
8. `/playlist list` → "Test" playlist still exists
9. Check `/app/data/` in container: `sessions.json`, `guild-settings.json`, `playlists/<userId>.json`, `liked/<userId>.json` all exist

---

## Stress & Edge Cases (Either, 2 min)

| Scenario | Expected |
|----------|----------|
| `/play invalidXYZ123` | "No results found" |
| `/skip` with nothing playing | "Nothing Playing" |
| `/queue remove position:999` | "Invalid position" |
| `/playlist view name:DoesNotExist` | "Playlist not found" |
| Queue 100 tracks, then `/queue` | Shows paginated or truncated (no crash) |
| Spam click Skip button 10× fast | No crash, rate-limit or single skip |
| Play track, immediately `/stop`, then `/previous` | "No previous track" or plays last |

---

## Bug Report Template

**Command:** `/command option:value`  
**Who ran it:** Admin / Member  
**Expected:** X should happen  
**Actual:** Y happened instead  
**Error log (if visible):** `[auralyn] Error executing /...`  
**Screenshot:** (attach if UI bug)

---

**Total test time: ~25-30 minutes for both testers.**  
**Priority:** Crashes, wrong permission denials, data loss after restart, pagination failures.

