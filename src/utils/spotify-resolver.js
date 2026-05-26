import spotifyUrlInfo from 'spotify-url-info';

const { getData } = spotifyUrlInfo(fetch);

const SPOTIFY_URL_PATTERN = /^https?:\/\/(open\.spotify\.com|spotify\.link)\//i;

// Spotify Web API endpoints
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_PAGE_LIMIT = 100;
const SPOTIFY_REQUEST_TIMEOUT_MS = 10_000;
// Hard ceiling so a maliciously-crafted huge playlist can't exhaust resources.
const SPOTIFY_MAX_TRACKS = 2000;

// Token cache (process-wide). Spotify client_credentials tokens last 1 hour.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

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

// ---------- Spotify Web API path (used when SPOTIFY_CLIENT_ID/SECRET are set) ----------

function getSpotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function getSpotifyAccessToken(creds) {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 30_000) return cachedToken;

  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(SPOTIFY_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Spotify token request failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  cachedToken = body.access_token;
  cachedTokenExpiresAt = now + (Number(body.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function spotifyApiGet(path, token) {
  const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SPOTIFY_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) {
    // Token possibly expired between cache window and use — clear and retry once upstream.
    cachedToken = null;
    cachedTokenExpiresAt = 0;
    throw new Error('Spotify API returned 401 (token rejected)');
  }
  if (!response.ok) {
    throw new Error(`Spotify API ${path} failed: HTTP ${response.status}`);
  }
  return response.json();
}

function parseSpotifyUrl(url) {
  const trimmed = url.trim();
  // Match /playlist/{id}, /album/{id}, /track/{id} optionally followed by query/fragment.
  const m = trimmed.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track|episode|artist)\/([A-Za-z0-9]+)/i);
  if (!m) return null;
  return { type: m[1].toLowerCase(), id: m[2] };
}

function trackFromPlaylistItem(item, fallbackArtwork) {
  const t = item?.track;
  if (!t || !t.name) return null;
  // Skip local tracks (not playable via Web API; no usable identifiers).
  if (t.is_local) return null;
  return {
    title: t.name,
    artist: joinArtists(t.artists),
    durationMs: Number.isFinite(t.duration_ms) ? t.duration_ms : null,
    artworkUrl: pickLargestImage(t.album?.images) ?? fallbackArtwork ?? null,
    spotifyUri: t.uri ?? null,
  };
}

function trackFromAlbumItem(item, albumArtwork) {
  if (!item?.name) return null;
  return {
    title: item.name,
    artist: joinArtists(item.artists),
    durationMs: Number.isFinite(item.duration_ms) ? item.duration_ms : null,
    artworkUrl: albumArtwork,
    spotifyUri: item.uri ?? null,
  };
}

async function fetchAllPages(firstPath, token, mapItem) {
  const tracks = [];
  let nextUrl = firstPath;
  while (nextUrl && tracks.length < SPOTIFY_MAX_TRACKS) {
    const page = await spotifyApiGet(nextUrl, token);
    const items = Array.isArray(page.items) ? page.items : [];
    for (const item of items) {
      const mapped = mapItem(item);
      if (mapped) tracks.push(mapped);
      if (tracks.length >= SPOTIFY_MAX_TRACKS) break;
    }
    nextUrl = page.next ?? null;
  }
  return tracks;
}

async function resolveViaSpotifyApi(url) {
  const creds = getSpotifyCredentials();
  if (!creds) return null;

  const parsed = parseSpotifyUrl(url);
  if (!parsed) return null;
  if (parsed.type === 'artist' || parsed.type === 'episode') return null;

  const token = await getSpotifyAccessToken(creds);

  if (parsed.type === 'playlist') {
    const meta = await spotifyApiGet(`/playlists/${parsed.id}?fields=name,images,tracks(total)`, token);
    const playlistArtwork = pickLargestImage(meta.images);
    const tracks = await fetchAllPages(
      `/playlists/${parsed.id}/tracks?limit=${SPOTIFY_PAGE_LIMIT}&fields=next,items(track(name,artists(name),duration_ms,uri,is_local,album(images)))`,
      token,
      (item) => trackFromPlaylistItem(item, playlistArtwork),
    );
    return { name: meta.name ?? 'Spotify Playlist', type: 'playlist', tracks };
  }

  if (parsed.type === 'album') {
    const meta = await spotifyApiGet(`/albums/${parsed.id}?fields=name,images,tracks(total)`, token);
    const albumArtwork = pickLargestImage(meta.images);
    const tracks = await fetchAllPages(
      `/albums/${parsed.id}/tracks?limit=${SPOTIFY_PAGE_LIMIT}`,
      token,
      (item) => trackFromAlbumItem(item, albumArtwork),
    );
    return { name: meta.name ?? 'Spotify Album', type: 'album', tracks };
  }

  if (parsed.type === 'track') {
    const t = await spotifyApiGet(`/tracks/${parsed.id}`, token);
    const artwork = pickLargestImage(t.album?.images);
    return {
      name: t.name,
      type: 'track',
      tracks: [{
        title: t.name,
        artist: joinArtists(t.artists),
        durationMs: Number.isFinite(t.duration_ms) ? t.duration_ms : null,
        artworkUrl: artwork,
        spotifyUri: t.uri ?? null,
      }],
    };
  }

  return null;
}

// ---------- Fallback path (no creds): spotify-url-info embed scrape, capped at ~100) ----------

async function resolveViaEmbedScrape(url) {
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

export async function resolveSpotifyMetadata(url) {
  // Prefer the official Web API when credentials are configured — it's the only path
  // that can return >100 tracks for a playlist (the embed scrape is hard-capped at the
  // first 100 entries baked into the embed HTML).
  if (getSpotifyCredentials()) {
    try {
      const apiResult = await resolveViaSpotifyApi(url);
      if (apiResult) return apiResult;
    } catch (err) {
      console.warn(`[spotify-resolver] Web API path failed (${err.message}); falling back to embed scrape (capped at 100 tracks)`);
    }
  }
  return resolveViaEmbedScrape(url);
}
