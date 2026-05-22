import test from 'node:test';
import assert from 'node:assert/strict';

import { createTrackResolver } from '../src/utils/tracks.js';

const track = ({ title, author = 'Unknown Channel', length = 240000, artwork = 'https://img/x.png' }) => ({
  encoded: `enc-${title}`,
  info: { title, author, length, artworkUrl: artwork, uri: `https://example.com/${encodeURIComponent(title)}` },
});

function fakeShoukakuReturning(results) {
  return {
    getIdealNode() {
      return {
        rest: {
          async resolve() {
            return { loadType: 'search', data: results };
          },
        },
      };
    },
  };
}

test('scorer prefers the official release over a remix for a plain query', async () => {
  const resolver = createTrackResolver();
  const shoukaku = fakeShoukakuReturning([
    track({ title: 'Dungu Thili Remix', author: 'Random YouTuber' }),
    track({ title: 'Dungu Thili (Official Music Video)', author: 'Movie Label' }),
  ]);

  const { track: picked } = await resolver.resolve(shoukaku, 'dungu thili', { sourcePriority: ['youtube'] });
  assert.equal(picked.info.title, 'Dungu Thili (Official Music Video)');
});

test('scorer does NOT penalize remix when the query explicitly asks for a remix', async () => {
  const resolver = createTrackResolver();
  const shoukaku = fakeShoukakuReturning([
    track({ title: 'Dungu Thili Remix', author: 'Random YouTuber' }),
    track({ title: 'Dungu Thili (Official Music Video)', author: 'Movie Label' }),
  ]);

  const { track: picked } = await resolver.resolve(shoukaku, 'dungu thili remix', { sourcePriority: ['youtube'] });
  assert.equal(picked.info.title, 'Dungu Thili Remix');
});

test('VEVO author beats a generic uploader on tie', async () => {
  const resolver = createTrackResolver();
  const shoukaku = fakeShoukakuReturning([
    track({ title: 'Song Title', author: 'Random Uploader' }),
    track({ title: 'Song Title', author: 'TaylorSwiftVEVO' }),
  ]);

  const { track: picked } = await resolver.resolve(shoukaku, 'song title', { sourcePriority: ['youtube'] });
  assert.equal(picked.info.author, 'TaylorSwiftVEVO');
});

test('YouTube Music "- Topic" auto-channel is treated as official', async () => {
  const resolver = createTrackResolver();
  const shoukaku = fakeShoukakuReturning([
    track({ title: 'Title', author: 'Reuploader Channel' }),
    track({ title: 'Title', author: 'Pradyumna Lenka - Topic' }),
  ]);

  const { track: picked } = await resolver.resolve(shoukaku, 'title', { sourcePriority: ['youtube'] });
  assert.equal(picked.info.author, 'Pradyumna Lenka - Topic');
});

test('lofi / sped up / slowed variants are penalised when not requested', async () => {
  const resolver = createTrackResolver();
  const shoukaku = fakeShoukakuReturning([
    track({ title: 'Hometown - Sped Up', author: 'Uploader A' }),
    track({ title: 'Hometown - Lofi', author: 'Uploader B' }),
    track({ title: 'Hometown - Slowed + Reverb', author: 'Uploader C' }),
    track({ title: 'Hometown (Official Audio)', author: 'Artist Official' }),
  ]);

  const { track: picked } = await resolver.resolve(shoukaku, 'hometown', { sourcePriority: ['youtube'] });
  assert.equal(picked.info.title, 'Hometown (Official Audio)');
});
