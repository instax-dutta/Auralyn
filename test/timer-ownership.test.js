import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { TimerRegistry } from '../src/utils/timer-registry.js';
import readyEvent from '../src/events/ready.js';
import { MusicPlayer } from '../src/music/player.js';

/**
 * These timers are unref'd, and `process.getActiveResourcesInfo()` only lists
 * timers that hold the event loop open, so counting active resources cannot see
 * a leak here. The observable failure of a leaked timer is that its callback
 * still runs after the owner is gone, so every test below asserts the callback
 * never fires once the registry is disposed.
 */
function fakeClient(overrides = {}) {
  return {
    user: { tag: 'Auralyn#0001', setActivity: async () => {} },
    guilds: { cache: { size: 1 } },
    logger: { info() {}, debug() {}, warn() {}, error() {} },
    musicPlayer: { restoreSessions: async () => {} },
    ...overrides,
  };
}

test('a registry clears only the timers it owns', () => {
  const registry = new TimerRegistry();
  let ownedTicks = 0;
  let foreignTicks = 0;

  const foreign = setInterval(() => { foreignTicks += 1; }, 5);
  const owned = registry.setInterval(() => { ownedTicks += 1; }, 5);

  assert.equal(registry.size, 1);

  registry.clear(owned);
  assert.equal(registry.size, 0, 'clearing an owned timer left it registered');

  return delay(40).then(() => {
    clearInterval(foreign);
    assert.equal(ownedTicks, 0, 'the cleared timer still fired');
    assert.ok(foreignTicks > 0, 'the foreign timer was wrongly cleared by the registry');
  });
});

test('clear refuses a handle the registry does not own', () => {
  const registry = new TimerRegistry();
  const foreign = setTimeout(() => {}, 10_000);

  assert.equal(registry.clear(foreign), false, 'the registry claimed a foreign handle');
  assert.equal(registry.clear(null), false, 'the registry accepted a null handle');

  clearTimeout(foreign);
});

test('disposing a registry is idempotent and releases everything', async () => {
  const registry = new TimerRegistry();
  let fired = 0;

  registry.setInterval(() => { fired += 1; }, 5);
  registry.setTimeout(() => { fired += 1; }, 5);

  assert.equal(registry.size, 2);

  const first = registry.dispose();
  assert.equal(first, 2, 'dispose did not report how many it released');
  assert.equal(registry.size, 0, 'dispose left timers registered');

  const second = registry.dispose();
  assert.equal(second, 0, 'disposing twice was not a no-op');

  await delay(40);
  assert.equal(fired, 0, 'a disposed timer still fired');
});

test('a disposed registry refuses to create new timers', async () => {
  const registry = new TimerRegistry();
  registry.dispose();

  let fired = false;
  const handle = registry.setTimeout(() => { fired = true; }, 1);

  assert.equal(handle, null, 'a disposed registry still handed out a timer');
  assert.equal(registry.size, 0);

  await delay(20);
  assert.equal(fired, false);
});

test('ready hands its presence timer to the client for disposal', async () => {
  const client = fakeClient();

  await readyEvent.execute(client, undefined, undefined);

  assert.ok(client.timerRegistry, 'ready did not expose a timer registry');
  assert.equal(client.timerRegistry.size, 1, 'ready did not own exactly the presence interval');
});

test('the ready presence interval is released on dispose', async () => {
  let presenceRefreshes = 0;

  const client = fakeClient({
    user: {
      tag: 'Auralyn#0001',
      setActivity: async () => { presenceRefreshes += 1; },
    },
  });

  await readyEvent.execute(client, undefined, undefined);

  // The initial presence update already ran once during execute().
  assert.equal(presenceRefreshes, 1);

  client.timerRegistry.dispose();

  assert.equal(client.timerRegistry.size, 0, 'dispose left the presence timer registered');

  await delay(40);
  assert.equal(presenceRefreshes, 1, 'the presence interval fired after disposal');
});

test('every player timer is released by one dispose', async () => {
  const player = new MusicPlayer();
  let fired = 0;

  player.timers.setInterval(() => { fired += 1; }, 5);
  player.timers.setTimeout(() => { fired += 1; }, 5);
  player.timers.setTimeout(() => { fired += 1; }, 5);

  assert.equal(player.timers.size, 3, 'the player registry did not track all three timers');

  const released = player.timers.dispose();

  assert.equal(released, 3, 'dispose did not release every player timer');
  assert.equal(player.timers.size, 0);

  await delay(40);
  assert.equal(fired, 0, 'a player timer fired after disposal');
});

test('player shutdown releases timers that no guild cleared', async () => {
  const player = new MusicPlayer();
  let fired = 0;

  player.timers.setInterval(() => { fired += 1; }, 5);

  const result = await player.shutdown();

  assert.equal(typeof result.timersReleased, 'number', 'shutdown did not report timers released');
  assert.equal(player.timers.size, 0, 'shutdown left player timers registered');

  await delay(40);
  assert.equal(fired, 0, 'a player timer fired after shutdown');
});