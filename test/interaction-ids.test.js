import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeCustomId, parseCustomId } from '../src/utils/interaction-ids.js';

test('a guild-scoped control parses its action and guild id', () => {
  assert.deepEqual(parseCustomId('auralyn:skip:123'), {
    action: 'skip',
    guildId: '123',
    payload: {},
  });
});

test('every guild-scoped control family parses', () => {
  const families = [
    'settings-reset', 'settings-cancel',
    'panel_prev', 'panel_pause', 'panel_skip', 'panel_loop', 'panel_stop',
    'skip', 'pause', 'resume', 'loop', 'stop',
  ];

  for (const action of families) {
    assert.deepEqual(
      parseCustomId(`auralyn:${action}:456`),
      { action, guildId: '456', payload: {} },
      `family ${action} did not parse`,
    );
  }
});

test('playlist pagination keeps a name containing colons intact', () => {
  assert.deepEqual(parseCustomId('auralyn:pl:page:user-1:chill:beats:2'), {
    action: 'playlist-page',
    guildId: null,
    payload: { userId: 'user-1', playlistName: 'chill:beats', page: 2 },
  });
});

test('playlist pagination parses an empty name', () => {
  assert.deepEqual(parseCustomId('auralyn:pl:page:user-1::3'), {
    action: 'playlist-page',
    guildId: null,
    payload: { userId: 'user-1', playlistName: '', page: 3 },
  });
});

test('liked pagination parses', () => {
  assert.deepEqual(parseCustomId('auralyn:liked:page:user-1:4'), {
    action: 'liked-page',
    guildId: null,
    payload: { userId: 'user-1', page: 4 },
  });
});

test('clear-liked parses its decision and owner', () => {
  for (const decision of ['confirm', 'cancel']) {
    assert.deepEqual(parseCustomId(`auralyn:liked:clear:${decision}:user-9`), {
      action: 'liked-clear',
      guildId: null,
      payload: { decision, userId: 'user-9' },
    });
  }
});

test('voteskip parses both votes', () => {
  assert.equal(parseCustomId('auralyn:voteskip-yes').payload.vote, 'yes');
  assert.equal(parseCustomId('auralyn:voteskip-no').payload.vote, 'no');
});

test('a non-Auralyn id is not parsed', () => {
  assert.equal(parseCustomId('other:skip:1'), null);
  assert.equal(parseCustomId(''), null);
  assert.equal(parseCustomId(undefined), null);
});

test('a guild-scoped control without a guild id is rejected', () => {
  assert.equal(parseCustomId('auralyn:skip'), null);
  assert.equal(parseCustomId('auralyn:skip:'), null);
});

test('a pagination id missing its page is rejected', () => {
  assert.equal(parseCustomId('auralyn:pl:page:user-1:Road Trip'), null);
});

test('encodeCustomId round-trips a payload containing the delimiter', () => {
  const id = encodeCustomId('pl', { payload: 'page', userId: 'user-1', playlistName: 'chill:beats', page: 2 });
  const parsed = parseCustomId(id);

  assert.equal(parsed.payload.playlistName, 'chill:beats');
  assert.equal(parsed.payload.page, 2);
  assert.equal(parsed.payload.userId, 'user-1');
});

test('encodeCustomId percent-encodes so the segment count stays fixed', () => {
  const id = encodeCustomId('pl', { payload: 'page', userId: 'user-1', playlistName: 'a:b:c', page: 9 });
  assert.equal(id.split(':').length, 6);
});