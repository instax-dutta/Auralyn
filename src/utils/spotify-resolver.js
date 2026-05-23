import spotifyUrlInfo from 'spotify-url-info';

const { getData } = spotifyUrlInfo(fetch);

const SPOTIFY_URL_PATTERN = /^https?:\/\/(open\.spotify\.com|spotify\.link)\//i;

export function isSpotifyUrl(value) {
  if (typeof value !== 'string') return false;
  return SPOTIFY_URL_PATTERN.test(value.trim());
}

function pickLargestImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const dimensions = (img) => (img.maxWidth ?? img.width ?? 0) * (img.maxHeight ?? img.height ?? 0);
  let best = images[0];
  for (let i = 1; i < images.length; i += 1) {
    if (dimensions(images[i]) > dimensions(best)) best = images[i];
  }
  return best?.url ?? null;
}

function getPlaylistArtwork(data) {
  return pickLargestImage(data.coverArt?.sources)
    ?? pickLargestImage(data.visualIdentity?.image)
    ?? null;
}

function joinArtists(artists) {
  if (!Array.isArray(artists)) return '';
  return artists.map(a => a?.name).filter(Boolean).join(', ');
}

export async function resolveSpotifyMetadata(url) {
  const data = await getData(url);

  if (data.type === 'artist' || data.type === 'episode') {
    return null;
  }

  const playlistArtwork = getPlaylistArtwork(data);

  if (Array.isArray(data.trackList) && data.trackList.length > 0) {
    const tracks = data.trackList
      .filter(t => t?.title)
      .map(t => ({
        title: t.title,
        artist: t.subtitle ?? '',
        durationMs: Number.isFinite(t.duration) ? t.duration : null,
        artworkUrl: playlistArtwork,
        spotifyUri: t.uri ?? null,
      }));

    return {
      name: data.name ?? 'Spotify Playlist',
      type: data.type ?? 'playlist',
      tracks,
    };
  }

  const title = data.title ?? data.name;
  if (!title) return null;

  return {
    name: title,
    type: data.type ?? 'track',
    tracks: [{
      title,
      artist: joinArtists(data.artists),
      durationMs: Number.isFinite(data.duration) ? data.duration : null,
      artworkUrl: playlistArtwork,
      spotifyUri: data.uri ?? null,
    }],
  };
}
