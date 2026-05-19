import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { GuildSettingsStore, defaultGuildSettings } from '../src/utils/guild-settings.js';
import {
  canManagePlayback,
  canUsePlayerControls,
  isAdminLikeMember,
} from '../src/utils/permissions.js';
import { createTrackResolver } from '../src/utils/tracks.js';
import { JsonSessionStore } from '../src/utils/session-store.js';

function createMember({
  id = 'user-1',
  roleIds = [],
  channelId = 'voice-1',
  admin = false,
} = {}) {
  return {
    id,
    voice: {
      channelId,
      channel: channelId ? { id: channelId } : null,
    },
    roles: {
      cache: new Map(roleIds.map((roleId) => [roleId, { id: roleId }])),
    },
    permissions: {
      has(permission) {
        return admin && permission === 'Administrator';
      },
    },
  };
}

test('guild settings store returns defaults and persists updates', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-settings-'));
  const filePath = path.join(tempDir, 'guild-settings.json');
  const store = new GuildSettingsStore({ filePath });

  const initial = await store.get('guild-1');
  assert.deepEqual(initial, defaultGuildSettings);

  const updated = await store.update('guild-1', {
    defaultVolume: 65,
    autoplay: true,
    inactivityTimeoutMs: 180000,
    djRoleIds: ['dj-role'],
    sourcePriority: ['direct', 'spotify', 'youtube'],
    controlMode: 'requester_or_dj',
  });

  assert.equal(updated.defaultVolume, 65);
  assert.equal(updated.autoplay, true);
  assert.deepEqual(updated.djRoleIds, ['dj-role']);

  const reloaded = new GuildSettingsStore({ filePath });
  assert.deepEqual(await reloaded.get('guild-1'), updated);

  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(raw['guild-1'], updated);
});

test('playback permissions allow requester, dj roles, and admins under restricted mode', () => {
  const track = {
    requestedByUserId: 'requester-1',
  };
  const settings = {
    ...defaultGuildSettings,
    controlMode: 'requester_or_dj',
    djRoleIds: ['dj-role'],
  };

  const requester = createMember({ id: 'requester-1', roleIds: [], admin: false });
  const dj = createMember({ id: 'listener-2', roleIds: ['dj-role'], admin: false });
  const admin = createMember({ id: 'listener-3', roleIds: [], admin: true });
  const stranger = createMember({ id: 'listener-4', roleIds: [], admin: false });

  assert.equal(isAdminLikeMember(admin), true);
  assert.equal(canManagePlayback({ member: requester, track, settings }), true);
  assert.equal(canManagePlayback({ member: dj, track, settings }), true);
  assert.equal(canManagePlayback({ member: admin, track, settings }), true);
  assert.equal(canManagePlayback({ member: stranger, track, settings }), false);
  assert.equal(
    canUsePlayerControls({
      member: requester,
      botVoiceChannelId: 'voice-1',
      track,
      settings,
    }),
    true,
  );
  assert.equal(
    canUsePlayerControls({
      member: createMember({ id: 'requester-1', channelId: 'voice-2' }),
      botVoiceChannelId: 'voice-1',
      track,
      settings,
    }),
    false,
  );
});

test('track resolver caches repeated resolutions and honors preferred search source', async () => {
  const calls = [];
  const resolver = createTrackResolver({
    ttlMs: 60_000,
    maxEntries: 50,
  });

  const shoukaku = {
    getIdealNode() {
      return {
        rest: {
          async resolve(query) {
            calls.push(query);
            return {
              loadType: 'search',
              data: [{
                encoded: 'encoded-1',
                info: { title: 'Track 1', author: 'Artist', length: 120000 },
              }],
            };
          },
        },
      };
    },
  };

  const first = await resolver.resolve(shoukaku, 'midnight city', { sourcePriority: ['soundcloud'] });
  const second = await resolver.resolve(shoukaku, 'midnight city', { sourcePriority: ['soundcloud'] });

  assert.equal(first.track.info.title, 'Track 1');
  assert.equal(second.track.info.title, 'Track 1');
  assert.deepEqual(calls, ['scsearch:midnight city']);
  assert.equal(resolver.getStats().hits, 1);
  assert.equal(resolver.getStats().misses, 1);
});

test('session store persists queue snapshots for later restore', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auralyn-sessions-'));
  const filePath = path.join(tempDir, 'sessions.json');
  const store = new JsonSessionStore({ filePath });

  await store.save('guild-1', {
    guildId: 'guild-1',
    queue: [{ encoded: 'encoded-1', info: { title: 'Track 1' }, requestedByUserId: 'user-1' }],
    currentTrack: { encoded: 'encoded-current', info: { title: 'Current Track' }, requestedByUserId: 'user-2' },
    volume: 85,
    loopMode: 2,
    textChannelId: 'text-1',
    voiceChannelId: 'voice-1',
    updatedAt: new Date('2026-05-19T00:00:00.000Z').toISOString(),
  });

  const restored = await store.get('guild-1');
  assert.equal(restored.currentTrack.info.title, 'Current Track');
  assert.equal(restored.queue[0].requestedByUserId, 'user-1');
  assert.equal(restored.volume, 85);
});
