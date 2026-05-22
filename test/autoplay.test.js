import test from 'node:test';
import assert from 'node:assert/strict';

import { extractYoutubeVideoId } from '../src/utils/tracks.js';
import { MusicPlayer } from '../src/music/player.js';

test('extractYoutubeVideoId parses common URL shapes', () => {
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://soundcloud.com/artist/song'), null);
  assert.equal(extractYoutubeVideoId(null), null);
  assert.equal(extractYoutubeVideoId(''), null);
});

const ytTrack = (id, extra = {}) => ({
  encoded: `enc-${id}`,
  info: {
    title: extra.title ?? `Track ${id}`,
    author: extra.author ?? 'Some Artist',
    length: 240000,
    uri: `https://www.youtube.com/watch?v=${id}`,
    artworkUrl: 'https://img/x.png',
  },
});

class FakeNode {
  constructor() {
    this.responses = []; // [{ matches: (id) => bool, response }]
    this.calls = [];
  }
  on(matcher, response) {
    this.responses.push({ matcher, response });
    return this;
  }
  rest = {
    resolve: async (identifier) => {
      this.calls.push(identifier);
      for (const { matcher, response } of this.responses) {
        if (matcher(identifier)) return response;
      }
      return { loadType: 'empty', data: null };
    },
  };
}

function fakeShoukaku(node) {
  return {
    getIdealNode: () => node,
    async joinVoiceChannel() { return { on: () => {}, playTrack: async () => {}, setGlobalVolume: async () => {} }; },
    async leaveVoiceChannel() {},
  };
}

function settingsStoreWithAutoplay(enabled) {
  return {
    async get() {
      return { ...{ defaultVolume: 70, autoplay: enabled, sourcePriority: ['direct', 'spotify', 'youtube'] } };
    },
    async update() { return {}; },
  };
}

test('tryAutoplay returns null when autoplay is disabled', async () => {
  const node = new FakeNode();
  const player = new MusicPlayer(fakeShoukaku(node), undefined, {
    settingsStore: settingsStoreWithAutoplay(false),
  });

  const state = player.queueManager.getState('g');
  state.currentTrack = ytTrack('aaaaaaaaaaa');
  state.history = [ytTrack('aaaaaaaaaaa')];

  const result = await player.tryAutoplay('g');
  assert.equal(result, null);
  assert.equal(node.calls.length, 0);
});

test('tryAutoplay picks first mix track not in history', async () => {
  const seedId = 'aaaaaaaaaaa';
  const alreadyPlayed = 'bbbbbbbbbbb';
  const targetId = 'ccccccccccc';

  const node = new FakeNode()
    .on((id) => id === `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`, {
      loadType: 'playlist',
      data: { tracks: [ytTrack(seedId), ytTrack(alreadyPlayed), ytTrack(targetId)] },
    });

  const player = new MusicPlayer(fakeShoukaku(node), undefined, {
    settingsStore: settingsStoreWithAutoplay(true),
  });

  const state = player.queueManager.getState('g');
  state.currentTrack = ytTrack(seedId);
  state.history = [ytTrack(alreadyPlayed), ytTrack(seedId)];

  const picked = await player.tryAutoplay('g');
  assert.equal(picked.encoded, `enc-${targetId}`);
  assert.equal(picked.requestedByName, 'autoplay');
  assert.equal(picked.requestedByUserId, null);
});

test('tryAutoplay falls through to ytmsearch when mix returns empty', async () => {
  const seedId = 'aaaaaaaaaaa';
  const targetId = 'zzzzzzzzzzz';

  const node = new FakeNode()
    .on((id) => id.startsWith('https://www.youtube.com/watch'), { loadType: 'empty', data: null })
    .on((id) => id.startsWith('ytmsearch:'), {
      loadType: 'search',
      data: [ytTrack(seedId), ytTrack(targetId)],
    });

  const player = new MusicPlayer(fakeShoukaku(node), undefined, {
    settingsStore: settingsStoreWithAutoplay(true),
  });

  const state = player.queueManager.getState('g');
  state.currentTrack = ytTrack(seedId, { author: 'My Band' });
  state.history = [ytTrack(seedId)];

  const picked = await player.tryAutoplay('g');
  assert.equal(picked.encoded, `enc-${targetId}`);
  const ytmsearchCall = node.calls.find(c => c.startsWith('ytmsearch:'));
  assert.equal(ytmsearchCall, 'ytmsearch:My Band');
});

test('tryAutoplay falls through to ytmsearch when seed has no YouTube id', async () => {
  const targetId = 'qqqqqqqqqqq';

  const seed = {
    encoded: 'enc-sc',
    info: {
      title: 'Some Song',
      author: 'Cool Artist',
      length: 240000,
      uri: 'https://soundcloud.com/cool-artist/some-song',
      artworkUrl: 'https://img/sc.png',
    },
  };

  const node = new FakeNode()
    .on((id) => id.startsWith('ytmsearch:'), {
      loadType: 'search',
      data: [ytTrack(targetId)],
    });

  const player = new MusicPlayer(fakeShoukaku(node), undefined, {
    settingsStore: settingsStoreWithAutoplay(true),
  });

  const state = player.queueManager.getState('g');
  state.currentTrack = seed;
  state.history = [seed];

  const picked = await player.tryAutoplay('g');
  assert.equal(picked.encoded, `enc-${targetId}`);
  const mixCall = node.calls.find(c => c.startsWith('https://www.youtube.com/watch'));
  assert.equal(mixCall, undefined, 'mix should not be attempted without seed videoId');
});

test('tryAutoplay sends an autoplay-miss embed when nothing is found', async () => {
  const sent = [];
  const textChannel = {
    async send(payload) { sent.push(payload); return { id: 'msg' }; },
  };

  const node = new FakeNode(); // returns empty for everything

  const player = new MusicPlayer(fakeShoukaku(node), undefined, {
    settingsStore: settingsStoreWithAutoplay(true),
  });

  const state = player.queueManager.getState('g');
  state.currentTrack = ytTrack('aaaaaaaaaaa');
  state.history = [ytTrack('aaaaaaaaaaa')];
  state.textChannel = textChannel;

  const result = await player.tryAutoplay('g');
  assert.equal(result, null);
  assert.equal(sent.length, 1);
  const embed = sent[0].embeds?.[0];
  assert.ok(embed, 'should send an embed payload');
});
