import { LoadType } from 'shoukaku';

const URL_PATTERN = /^https?:\/\//i;

export function normalizeSearchQuery(query) {
  const trimmed = query.trim();
  return URL_PATTERN.test(trimmed) ? trimmed : `ytsearch:${trimmed}`;
}

export async function resolveTrack(shoukaku, query) {
  const node = shoukaku.getIdealNode();
  if (!node) {
    throw new Error('No connected Lavalink node is available.');
  }

  const result = await node.rest.resolve(normalizeSearchQuery(query));
  if (!result) {
    return { track: null, playlist: null };
  }

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
