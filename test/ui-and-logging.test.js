import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuralynColors,
  buildPlayReply,
  buildPlayerControls,
  createNowPlayingEmbed,
} from '../src/utils/embeds.js';
import { createLogger } from '../src/utils/logger.js';

const sampleTrack = {
  encoded: 'encoded-track',
  info: {
    title: 'Midnight Skyline',
    author: 'Auralyn Ensemble',
    length: 245000,
    uri: 'https://example.com/midnight-skyline',
    artworkUrl: 'https://example.com/cover.png',
  },
};

test('createNowPlayingEmbed builds a branded now playing embed', () => {
  const embed = createNowPlayingEmbed({
    track: sampleTrack,
    title: 'Auralyn | Playback Resumed',
    loopModeLabel: 'Queue',
    volume: 72,
    queueLength: 4,
    requestedBy: 'R4C3R',
  });

  const json = embed.toJSON();
  assert.equal(json.color, AuralynColors.primary);
  assert.equal(json.title, 'Auralyn | Playback Resumed');
  assert.match(json.description, /Midnight Skyline/);
  assert.equal(json.thumbnail.url, 'https://example.com/cover.png');
  assert.deepEqual(
    json.fields.map((field) => field.name),
    ['Artist', 'Duration', 'Volume', 'Loop', 'Up Next', 'Requested By'],
  );
});

test('buildPlayReply returns queue-specific response when adding behind an active track', () => {
  const reply = buildPlayReply({
    guildId: 'guild-1',
    isPaused: false,
    requestedBy: 'R4C3R',
    addedTrack: sampleTrack,
    currentTrack: {
      ...sampleTrack,
      info: {
        ...sampleTrack.info,
        title: 'Already Playing',
      },
    },
    queueLength: 3,
    loopModeLabel: 'Off',
    volume: 100,
    startedPlayback: false,
  });

  assert.equal(reply.embeds.length, 2);
  assert.equal(reply.embeds[0].toJSON().title, 'Auralyn | Added to Queue');
  assert.match(reply.embeds[0].toJSON().description, /Midnight Skyline/);
  assert.equal(reply.embeds[1].toJSON().title, 'Auralyn | Now Playing');
  assert.equal(reply.components[0].toJSON().components[0].custom_id, 'auralyn:skip:guild-1');
});

test('buildPlayerControls reflects paused state in button ids and labels', () => {
  const activeRow = buildPlayerControls({ guildId: 'guild-1', isPaused: false })[0];
  const pausedRow = buildPlayerControls({ guildId: 'guild-1', isPaused: true })[0];
  const activeJson = activeRow.toJSON();
  const pausedJson = pausedRow.toJSON();

  assert.equal(activeJson.components[1].custom_id, 'auralyn:pause:guild-1');
  assert.equal(activeJson.components[1].label, 'Pause');
  assert.equal(pausedJson.components[1].custom_id, 'auralyn:resume:guild-1');
  assert.equal(pausedJson.components[1].label, 'Resume');
  assert.equal(activeJson.components[0].custom_id, 'auralyn:skip:guild-1');
  assert.equal(activeJson.components[2].custom_id, 'auralyn:stop:guild-1');
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
