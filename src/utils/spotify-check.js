const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const REQUEST_TIMEOUT_MS = 10_000;

export async function checkSpotifyCredentials(logger) {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    logger.info(
      'Spotify Web API credentials not set — Spotify URLs will still work via client-side embed resolution. (Set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET only if you want lavasrc Spotify enabled.)',
    );
    return { status: 'missing' };
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error(
      `Spotify credentials FOUND but verification FAILED (network/timeout): ${error.message}. They may still be valid; check connectivity to accounts.spotify.com.`,
    );
    return { status: 'unreachable', error };
  }

  if (response.ok) {
    logger.info('Spotify credentials VALID — Web API auth successful.');
    return { status: 'valid' };
  }

  let detail = '';
  try {
    const body = await response.text();
    detail = body ? ` Response: ${body.slice(0, 200)}` : '';
  } catch {}

  logger.warn(
    `Spotify Web API credentials FOUND but INVALID — Spotify rejected auth (HTTP ${response.status}).${detail} This only affects lavasrc-based Spotify resolution; client-side embed resolution still works.`,
  );
  return { status: 'invalid', httpStatus: response.status };
}
