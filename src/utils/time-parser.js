/**
 * Parses a human-readable duration string → milliseconds.
 * Accepts: "10m", "1h30m", "90s", "1h", "2h15m30s", bare numbers ("45" → 45s).
 * Returns null on invalid / zero input.
 */
export function parseHumanDuration(str) {
  const trimmed = (str ?? '').trim();
  if (!trimmed) return null;

  // bare integer → treat as seconds
  if (/^\d+$/.test(trimmed)) {
    const s = parseInt(trimmed, 10);
    return s > 0 ? s * 1000 : null;
  }

  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;

  const h = parseInt(match[1] ?? '0', 10);
  const m = parseInt(match[2] ?? '0', 10);
  const s = parseInt(match[3] ?? '0', 10);
  const ms = (h * 3600 + m * 60 + s) * 1000;
  return ms > 0 ? ms : null;
}
