import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNowPlayingPayload,
  buildSimpleV2,
  buildActionFeedback,
} from '../src/utils/music-ui.js';
import { createLogger } from '../src/utils/logger.js';

test('buildSimpleV2 returns a Components V2 payload', () => {
  const payload = buildSimpleV2('Auralyn | Status', 'All systems operational.');

  assert.ok(payload.components, 'should have components array');
  assert.ok(payload.components[0].toJSON().accent_color, 'should have accent color');
  assert.ok(payload.flags !== undefined, 'should have IsComponentsV2 flag');
});

test('buildActionFeedback returns ok payload for success', () => {
  const payload = buildActionFeedback('Queue Updated', 'Removed a track.', true);
  const json = payload.components[0].toJSON();
  assert.ok(json.accent_color, 'should have color');
});

test('buildActionFeedback returns error payload for failure', () => {
  const payload = buildActionFeedback('Error', 'Something went wrong.', false);
  const json = payload.components[0].toJSON();
  assert.ok(json.accent_color, 'should have color');
});

test('buildNowPlayingPayload includes progress bar and player controls', () => {
  const payload = buildNowPlayingPayload({
    track: {
      info: {
        title: 'Midnight Skyline',
        author: 'Auralyn Ensemble',
        length: 245000,
        uri: 'https://example.com/midnight-skyline',
        artworkUrl: 'https://example.com/cover.png',
      },
    },
    position: 10000,
    volume: 72,
    loopMode: 2,
    queueLength: 4,
    autoplay: false,
    guildId: 'guild-1',
    isPaused: false,
  });

  const jsonStr = JSON.stringify(payload);
  assert.ok(jsonStr.includes('Midnight Skyline'), 'should contain track title');
  assert.ok(jsonStr.includes('Auralyn'), 'should be branded');
});

test('logger filters messages below configured level', () => {
  const entries = [];
  const logger = createLogger({
    level: 'warn',
    sink: (entry) => entries.push(entry),
    scope: 'test',
  });

  logger.info('hidden');
  logger.warn('visible');
  logger.error('also visible');

  assert.deepEqual(
    entries.map((entry) => `${entry.level}:${entry.message}`),
    ['warn:visible', 'error:also visible'],
  );
});
