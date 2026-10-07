# YouTube playback canary — measured 2026-10-07

YouTube playback is **broken in production right now**, and no available
configuration fixes it. This file records what was actually measured so nobody
re-derives it by trial and error.

## How it was measured

Not through Discord. A real Lavalink was started with each candidate and asked to
resolve the two tracks that failed on the production server:

- `r8iPHiciQd0` — Aksomaniac (official video)
- `6lZcMUYf_eM` — God Mode (Topic channel)

via `GET /v4/loadtracks?identifier=...`. A pass means the resolution layer works,
independently of Discord and the bot.

## Results

| candidate | result |
| --- | --- |
| youtube-plugin 1.18.1 (release) | 0/2 |
| youtube-plugin 1.18.2 (release) | 0/2 |
| snapshot `f45bbb7a` (recommended in upstream #240) | 0/2 |
| snapshot `2be8e542` (newest published) | 0/2 |
| 1.18.2 + self-hosted yt-cipher (`OVERRIDE_PLAYER_VARIANT=IAS`) | 0/2 |

Every candidate failed. **No version bump fixes playback.**

## The two distinct root causes

### 1. The signature failure was Lavalink's LEGACY source, not the plugin

The error everyone sees is:

```
Client [MWEB] failed: Must find sig function from script: /s/player/.../base.js
  at com.sedmelluq.discord.lavaplayer.source.youtube.YoutubeSignatureCipherManager
```

That package, `lavaplayer.source.youtube`, is Lavalink's **built-in legacy
YouTube source**, enabled by `lavalink.server.sources.youtube: true`. It is
unmaintained and cannot parse current player scripts.

The plugin's own manager lives under `dev.lavalink.youtube.*`. The shipped
`lavalink/application.yml` already sets `sources.youtube: false` and enables the
plugin via `plugins.youtube.enabled: true`, which is the correct arrangement.

With that flag respected, signature extraction **succeeds**. The failure mode
changes entirely — which is how this was found, after several candidate versions
had already been wrongly ruled out.

### 2. Every client then requires a PO token

With the plugin actually resolving, the per-client failures are:

```
Client [ANDROID_VR]       failed: This video requires login.
Client [MWEB]             failed: This video requires login.
Client [WEB]              failed: This video requires login.
Client [WEB_EMBEDDED_PLAYER] failed: This video is unavailable
```

This is upstream [youtube-source#240](https://github.com/lavalink-devs/youtube-source/issues/240)
(open, no fix released). It is configured under `plugins.youtube.pot` with a
`token` and `visitorData`, and generating one requires running YouTube's BotGuard
JS, which is its own piece of work with its own expiry and refresh handling.

The remote cipher server that upstream recommends
([yt-cipher](https://github.com/kikkia/yt-cipher)) addresses signature/`n`
extraction only. It does not supply a PO token, so it cannot fix cause 2. It was
verified to be configured and contacted-or-not depending on wiring, and it made
no difference to the outcome.

## What is NOT the cause

- Not the plugin version. Every published version was measured.
- Not the read-only rootfs, the data directory, or anything from Phase 3.
  Those were real and are fixed, but they are unrelated to this.
- Not a Discord-side or bot-side problem.

## What would actually fix it

1. Wait for a youtube-source release that resolves this client login wall, then
   bump. Upstream announces new versions on Lavalink boot; that announcement is
   the only signal.
2. Generate and supply a `poToken` + `visitorData` under `plugins.youtube.pot`.
   Self-hosted, with refresh handling. Not a config-only change.

Until one of those happens, Auralyn will resolve tracks and then fail to play
them. `/play` currently reports the track and then Lavalink rejects it.

## Guarding against a repeat of the wrong conclusion

`test/lavalink-plugin-versions.test.js` deliberately asserts that **no** version
is known good, because an earlier version of that file claimed 1.18.2 resolved
audio. That claim came from a boot warning that a newer version existed — it was
never verified, and it was wrong. The test now fails if the claim creeps back.