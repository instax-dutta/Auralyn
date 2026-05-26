import { LoadType } from 'shoukaku';
import { DEFAULT_SOURCE_PRIORITY } from './guild-settings.js';
import { isSpotifyUrl, resolveSpotifyMetadata } from './spotify-resolver.js';
import { getSpotifyYtCache } from './spotify-yt-cache.js';

const SPOTIFY_YT_SEARCH_CONCURRENCY = 5;

const URL_PATTERN = /^https?:\/\//i;
const SEARCH_SOURCE_PREFIXES = new Set(['ytsearch', 'ytmsearch', 'scsearch', 'spsearch']);

const YOUTUBE_VIDEO_ID_PATTERN = /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)*v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:[^#\s]*&)*v=)([A-Za-z0-9_-]{11})/;

export function extractYoutubeVideoId(uri) {
  if (typeof uri !== 'string') return null;
  const match = uri.match(YOUTUBE_VIDEO_ID_PATTERN);
  return match ? match[1] : null;
}

const SOURCE_PREFIX_MAP = {
  youtube: 'ytsearch',
  soundcloud: 'scsearch',
};

const UNOFFICIAL_TITLE_PATTERNS = [
  /\bremix(?:ed|es)?\b/i,
  /\bcover\b/i,
  /\blo-?\s?fi\b/i,
  /\bsped[\s-]?up\b/i,
  /\bspeed[\s-]?up\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bbass[\s-]?boosted\b/i,
  /\bnightcore\b/i,
  /\b8d\b/i,
  /\bmashup\b/i,
  /\bchopped\b/i,
  /\bscrewed\b/i,
  /\bpiano version\b/i,
  /\bguitar version\b/i,
  /\bacoustic version\b/i,
];

const OFFICIAL_AUTHOR_PATTERNS = [
  /\s-\s?topic$/i,
  /vevo$/i,
  /\bvevo\b/i,
  /\bofficial\b/i,
];

const OFFICIAL_TITLE_PATTERNS = [
  /\bofficial\b/i,
];

export function normalizeSearchQuery(query, prefix = 'ytsearch') {
  const trimmed = query.trim();
  if (URL_PATTERN.test(trimmed)) return trimmed;

  const [first, ...rest] = trimmed.split(':');
  if (SEARCH_SOURCE_PREFIXES.has(first) && rest.length > 0) {
    return trimmed;
  }

  return `${prefix}:${trimmed}`;
}

// Process-wide resolver singleton. Without this every /play call would create
// a fresh empty cache and re-query YouTube for songs we just resolved.
let defaultResolver = null;
function getDefaultResolver() {
  if (!defaultResolver) {
    defaultResolver = createTrackResolver({ ttlMs: 30 * 60_000, maxEntries: 1000 });
  }
  return defaultResolver;
}

export async function resolveTrack(shoukaku, query, { sourcePriority = DEFAULT_SOURCE_PRIORITY } = {}) {
  return getDefaultResolver().resolve(shoukaku, query, { sourcePriority });
}

function shapeResolvedResult(result) {
  if (!result) return { track: null, playlist: null };
  switch (result.loadType) {
    case LoadType.TRACK:
      return { track: result.data, playlist: null };
    case LoadType.SEARCH:
      return { track: result.data[0] ?? null, playlist: null };
    case LoadType.PLAYLIST:
      return {
        track: result.data.tracks[result.data.info.selectedTrack] ?? result.data.tracks[0] ?? null,
        playlist: result.data,
      };
    case LoadType.EMPTY:
      return { track: null, playlist: null };
    case LoadType.ERROR:
      throw new Error(result.data.message || 'Lavalink failed to resolve the track.');
    default:
      throw new Error(`Unsupported Lavalink load type: ${result.loadType}`);
  }
}

function isDirectUrl(query) {
  return URL_PATTERN.test(query.trim());
}

function sourceLabel(sourceName) {
  if (sourceName === 'direct') return 'Direct URL';
  if (sourceName === 'spotify') return 'Spotify';
  if (sourceName === 'youtube') return 'YouTube';
  if (sourceName === 'soundcloud') return 'SoundCloud';
  return sourceName;
}

function queryRequestsUnofficial(queryLower) {
  return UNOFFICIAL_TITLE_PATTERNS.some(rx => rx.test(queryLower));
}

function hasUnofficialMarker(titleLower) {
  return UNOFFICIAL_TITLE_PATTERNS.some(rx => rx.test(titleLower));
}

function hasOfficialSignal(title, author) {
  return (
    OFFICIAL_AUTHOR_PATTERNS.some(rx => rx.test(author))
    || OFFICIAL_TITLE_PATTERNS.some(rx => rx.test(title))
  );
}

function scoreSearchResult(track, query) {
  const info = track?.info ?? {};
  let score = 0;
  const queryLower = query.toLowerCase();
  const titleLower = (info.title ?? '').toLowerCase();
  const authorLower = (info.author ?? '').toLowerCase();

  const hasArtwork = Boolean(info.artworkUrl);
  const hasValidAuthor = info.author && info.author !== 'Unknown';
  const duration = info.length ?? 0;
  const isReasonableDuration = duration >= 120000 && duration <= 600000;

  if (hasArtwork) score += 2;
  if (hasValidAuthor) score += 1;
  if (isReasonableDuration) score += 1;

  if (titleLower.includes(queryLower)) score += 3;
  if (authorLower.includes(queryLower)) score += 2;

  const queryWords = queryLower.split(/\s+/).filter(Boolean);
  const titleWords = titleLower.split(/\s+/);
  const matchCount = queryWords.filter(w => titleWords.some(tw => tw.includes(w))).length;
  score += (matchCount / Math.max(queryWords.length, 1)) * 2;

  if (!queryRequestsUnofficial(queryLower) && hasUnofficialMarker(titleLower)) {
    score -= 4;
  }
  if (hasOfficialSignal(info.title ?? '', info.author ?? '')) {
    score += 3;
  }

  return score;
}

function pickBestSearchResult(results, query) {
  if (!results || results.length === 0) return null;
  if (results.length === 1) return results[0];

  let best = results[0];
  let bestScore = scoreSearchResult(best, query);

  for (let i = 1; i < results.length; i++) {
    const currentScore = scoreSearchResult(results[i], query);
    if (currentScore > bestScore) {
      best = results[i];
      bestScore = currentScore;
    }
  }

  return best;
}

function shapeSearchResult(result, query) {
  if (!result || result.loadType !== LoadType.SEARCH) return shapeResolvedResult(result);

  const best = pickBestSearchResult(result.data, query);
  return { track: best, playlist: null };
}

// Cache Spotify→YouTube search results so re-queuing the same playlist (or
// shared songs across different playlists) doesn't re-hit YouTube. Persisted
// to disk via SpotifyYtCache so the cache survives bot restarts. Keyed by
// Spotify track ID when available, falling back to title+artist.

function spotifyCacheKey(spotifyTrack) {
  return spotifyTrack.id
    ? `id:${spotifyTrack.id}`
    : `q:${(spotifyTrack.title || '').toLowerCase()}::${(spotifyTrack.artist || '').toLowerCase()}`;
}

async function searchYoutubeForSpotifyTrack(node, spotifyTrack) {
  const cache = getSpotifyYtCache();
  const cacheKey = spotifyCacheKey(spotifyTrack);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const query = spotifyTrack.artist
    ? `${spotifyTrack.title} ${spotifyTrack.artist}`
    : spotifyTrack.title;

  const result = await node.rest.resolve(`ytsearch:${query}`);
  if (!result || result.loadType !== LoadType.SEARCH) return null;
  const candidates = Array.isArray(result.data) ? result.data : [];
  if (candidates.length === 0) return null;

  const best = pickBestSearchResult(candidates, query);
  if (!best) return null;

  const shaped = {
    ...best,
    info: {
      ...best.info,
      title: spotifyTrack.title,
      author: spotifyTrack.artist || best.info?.author || 'Unknown',
      artworkUrl: spotifyTrack.artworkUrl || best.info?.artworkUrl || null,
    },
  };

  cache.set(cacheKey, shaped);
  return shaped;
}

async function resolveSpotifyViaYouTube(node, spotifyUrl) {
  let metadata;
  try {
    metadata = await resolveSpotifyMetadata(spotifyUrl);
  } catch (error) {
    console.warn(`[spotify-resolver] Failed to fetch Spotify metadata for ${spotifyUrl}: ${error.message}`);
    return { track: null, playlist: null, sourceName: null };
  }

  if (!metadata || metadata.tracks.length === 0) {
    return { track: null, playlist: null, sourceName: null };
  }

  const resolved = [];
  for (let i = 0; i < metadata.tracks.length; i += SPOTIFY_YT_SEARCH_CONCURRENCY) {
    const batch = metadata.tracks.slice(i, i + SPOTIFY_YT_SEARCH_CONCURRENCY);
    const results = await Promise.all(batch.map(t =>
      searchYoutubeForSpotifyTrack(node, t).catch(err => {
        console.warn(`[spotify-resolver] YouTube search failed for "${t.title}": ${err.message}`);
        return null;
      }),
    ));
    for (const track of results) if (track) resolved.push(track);
  }

  if (resolved.length === 0) {
    return { track: null, playlist: null, sourceName: null };
  }

  if (metadata.type === 'track') {
    return { track: resolved[0], playlist: null, sourceName: 'spotify' };
  }

  return {
    track: resolved[0],
    playlist: {
      info: { name: metadata.name, selectedTrack: 0 },
      tracks: resolved,
    },
    sourceName: 'spotify',
  };
}

async function tryResolveFromSource(shoukaku, query, sourceName) {
  const node = shoukaku.getIdealNode();
  if (!node) throw new Error('No connected Lavalink node is available.');

  if (sourceName === 'direct') {
    const trimmed = query.trim();
    if (!isDirectUrl(trimmed)) return { track: null, playlist: null, sourceName: null };
    if (isSpotifyUrl(trimmed)) {
      return resolveSpotifyViaYouTube(node, trimmed);
    }
    const result = await node.rest.resolve(trimmed);
    if (result?.loadType === LoadType.ERROR) return { track: null, playlist: null, sourceName: null };
    const shaped = shapeResolvedResult(result);
    return { ...shaped, sourceName: 'direct' };
  }

  const prefix = SOURCE_PREFIX_MAP[sourceName];
  if (!prefix) return { track: null, playlist: null, sourceName: null };

  const prefixedQuery = `${prefix}:${query.trim()}`;
  const result = await node.rest.resolve(prefixedQuery);

  if (result?.loadType === LoadType.ERROR) {
    return { track: null, playlist: null, sourceName: null };
  }

  if (result?.loadType === LoadType.SEARCH) {
    const bestTrack = pickBestSearchResult(result.data, query);
    if (!bestTrack) return { track: null, playlist: null, sourceName: null };
    return { track: bestTrack, playlist: null, sourceName };
  }

  const shaped = shapeResolvedResult(result);
  return { ...shaped, sourceName: shaped.track ? sourceName : null };
}

export function createTrackResolver({
  ttlMs = 30_000,
  maxEntries = 250,
} = {}) {
  const cache = new Map();
  const stats = {
    hits: 0,
    misses: 0,
  };

  const prune = () => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }

    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  };

  const cacheKey = (query, sourcePriority) =>
    `${query}::${(sourcePriority ?? DEFAULT_SOURCE_PRIORITY).join(',')}`;

  return {
    async resolve(shoukaku, query, { sourcePriority = DEFAULT_SOURCE_PRIORITY } = {}) {
      const key = cacheKey(query, sourcePriority);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        stats.hits += 1;
        return cached.value;
      }

      cache.delete(key);
      stats.misses += 1;

      let result = { track: null, playlist: null, sourceName: null };

      for (const source of sourcePriority) {
        result = await tryResolveFromSource(shoukaku, query, source);
        if (result.track) {
          result.track._sourceInfo = {
            source: sourceLabel(source),
            sourceName: source,
          };
          break;
        }
      }

      const value = { track: result.track, playlist: result.playlist };
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      prune();
      return value;
    },
    clear() {
      cache.clear();
      stats.hits = 0;
      stats.misses = 0;
    },
    getStats() {
      prune();
      return {
        hits: stats.hits,
        misses: stats.misses,
        entries: cache.size,
      };
    },
  };
}

export function formatDuration(length) {
  if (!Number.isFinite(length)) return 'Live';

  const totalSeconds = Math.floor(length / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function trackTitle(track) {
  return track?.info?.title ?? 'Unknown title';
}

export function trackUri(track) {
  return track?.info?.uri ?? null;
}

export function trackAuthor(track) {
  return track?.info?.author ?? 'Unknown';
}

export function trackArtwork(track) {
  return track?.info?.artworkUrl ?? null;
}

export function trackLength(track) {
  return formatDuration(track?.info?.length);
}

export function trackSourceInfo(track) {
  return track?._sourceInfo ?? null;
}
