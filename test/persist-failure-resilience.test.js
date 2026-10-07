import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { MusicPlayer } from '../src/music/player.js';

/**
 * Reproduces the production crash from a read-only data directory:
 *
 *   Error: EROFS: read-only file system, open '/app/data/sessions.json.lock'
 *     at async file:///app/src/utils/storage-lock.js:56:24
 *   Node.js v20.20.2
 *
 * A session save rejects with a disk error, persistGuildState rethrows it, and
 * the /play path called persist with `void`, so the rejection became an
 * unhandled rejection. Node 20 terminates on that, so the shard exited 1 and
 * the manager respawned it in a loop.
 *
 * Losing a session snapshot is a durability loss, not a reason to stop playing.
 */

class FakeLavalinkPlayer extends EventEmitter {
  constructor() {
    super();
    this.played = [];
  }
  async playTrack(options) { this.played.push(options.track.encoded); }
  async stopTrack() {}
  async destroy() {}
  async setPaused() {}
  async setGlobalVolume() {}
  async setFilters() {}
}

class FakeShoukaku {
  constructor(player = new FakeLavalinkPlayer()) {
    this.player = player;
  }
  async joinVoiceChannel() { return this.player; }
  async leaveVoiceChannel() {}
}

const track = {
  encoded: 'encoded-one',
  info: { title: 'Track', author: 'Artist', length: 120000, uri: 'https://example.com/1' },
};

function recordingLogger() {
  const entries = [];
  const record = level => (...args) => entries.push({ level, args });
  return {
    entries,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child() { return this; },
  };
}

function readOnlyStore(error) {
  return {
    saves: 0,
    async save() {
      this.saves += 1;
      throw error;
    },
  };
}

const erofs = () => Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });

test('a failed session save does not reject', async () => {
  const logger = recordingLogger();
  const store = readOnlyStore(erofs());
  const musicPlayer = new MusicPlayer(new FakeShoukaku(), logger, { sessionStore: store });

  // This is the exact call the /play path makes, floating. If it rejects, the
  // process dies; awaiting it here turns the crash into an assertion.
  await assert.doesNotReject(
    () => musicPlayer.persistGuildState('guild'),
    'a disk failure while saving a session crashed the player',
  );

  assert.equal(store.saves, 1, 'the save was never attempted');
});

test('a failed session save is reported once, not on every event', async () => {
  const logger = recordingLogger();
  const store = readOnlyStore(erofs());
  const musicPlayer = new MusicPlayer(new FakeShoukaku(), logger, { sessionStore: store });

  for (let i = 0; i < 5; i += 1) {
    await musicPlayer.persistGuildState('guild');
  }

  const warnings = logger.entries.filter(entry => entry.level === 'warn');
  assert.equal(warnings.length, 1,
    `a persistent failure was logged ${warnings.length} times, which floods the log every track change`);
  assert.match(String(warnings[0].args[0]), /persist/i);
  assert.equal(warnings[0].args[1].code, 'EROFS',
    'the warning did not carry the error code needed to diagnose it');
});

test('recovery is reported once after a failure', async () => {
  const logger = recordingLogger();
  let failing = true;
  const store = {
    async save() {
      if (failing) throw erofs();
    },
  };
  const musicPlayer = new MusicPlayer(new FakeShoukaku(), logger, { sessionStore: store });

  await musicPlayer.persistGuildState('guild');
  failing = false;
  await musicPlayer.persistGuildState('guild');
  await musicPlayer.persistGuildState('guild');

  const recoveries = logger.entries.filter(entry =>
    entry.level === 'info' && /recover/i.test(String(entry.args[0])));

  assert.equal(recoveries.length, 1,
    `recovery was reported ${recoveries.length} times instead of once`);
});

test('the /play path survives a read-only data directory', async () => {
  const logger = recordingLogger();
  const store = readOnlyStore(erofs());
  const lavalinkPlayer = new FakeLavalinkPlayer();
  const musicPlayer = new MusicPlayer(new FakeShoukaku(lavalinkPlayer), logger, { sessionStore: store });

  const rejections = [];
  const onRejection = reason => rejections.push(reason);
  process.on('unhandledRejection', onRejection);

  try {
    await musicPlayer.enqueue({
      guildId: 'guild',
      track,
      textChannel: { send: async () => {} },
      voiceChannel: { id: 'voice', guild: { shardId: 0 } },
    });

    // enqueue() persists floating; give the microtask queue a chance to settle
    // so an unhandled rejection would surface here.
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    process.off('unhandledRejection', onRejection);
  }

  assert.deepEqual(rejections, [],
    `the /play path produced an unhandled rejection, which exits Node 20: ${rejections.map(r => r?.message).join(', ')}`);

  assert.deepEqual(lavalinkPlayer.played, ['encoded-one'],
    'playback did not start even though only the session write failed');
});

test('a stale write is still skipped quietly and never reported as a failure', async () => {
  const logger = recordingLogger();
  const store = {
    async save() {
      throw Object.assign(new Error('stale'), { name: 'StaleRevisionError' });
    },
  };
  const musicPlayer = new MusicPlayer(new FakeShoukaku(), logger, { sessionStore: store });

  await musicPlayer.persistGuildState('guild');

  assert.equal(logger.entries.filter(e => e.level === 'warn').length, 0,
    'a benign stale-write race was reported as a persistence failure');
});