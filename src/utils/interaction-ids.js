/**
 * Central parser for Auralyn component custom IDs.
 *
 * Every button carries `auralyn:<action>:<guildId>` and, for the
 * multi-segment families, additional trailing segments. Splitting on ':'
 * by fixed index silently corrupts any payload that itself contains a
 * delimiter, so each family declares how many segments it owns and the
 * payload is read from the right-hand side.
 */

const FAMILY_SEGMENTS = {
  'settings-reset': 2,
  'settings-cancel': 2,
  panel_prev: 2,
  panel_pause: 2,
  panel_skip: 2,
  panel_loop: 2,
  panel_stop: 2,
  skip: 2,
  pause: 2,
  resume: 2,
  loop: 2,
  stop: 2,
};

const FAMILY_PAYLOAD = {
  'playlist-page': { head: ['userId'], variable: 'playlistName', tail: 'page' },
  'liked-page': { head: ['userId'], tail: 'page' },
  'liked-clear': { head: ['decision'], tail: 'userId' },
};

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function readFamily(values, shape) {
  const minimum = shape.head.length + (shape.variable ? 1 : 0) + 1;
  if (values.length < minimum) return null;

  const payload = {};
  shape.head.forEach((name, index) => {
    payload[name] = decode(values[index]);
  });

  const headLength = shape.head.length;
  if (shape.variable) {
    const lastIndex = values.length - 1;
    payload[shape.variable] = decode(values.slice(headLength, lastIndex).join(':'));
  }

  const tailValue = decode(values[values.length - 1]);
  payload[shape.tail] = shape.tail === 'page' ? Number(tailValue) : tailValue;

  return payload;
}

export function encodeCustomId(action, { guildId, ...payload } = {}) {
  const segments = ['auralyn', action];
  if (guildId !== undefined && guildId !== null) segments.push(String(guildId));
  for (const value of Object.values(payload)) {
    if (value === undefined || value === null) continue;
    segments.push(encodeURIComponent(String(value)));
  }
  return segments.join(':');
}

/**
 * Returns `{ action, guildId, payload }`, or null when the id is not an
 * Auralyn component id or its shape does not match its family.
 */
export function parseCustomId(customId) {
  if (typeof customId !== 'string' || !customId.startsWith('auralyn:')) return null;

  const parts = customId.split(':');
  const action = parts[1];
  if (!action) return null;

  if (action === 'pl' && parts[2] === 'page') {
    const payload = readFamily(parts.slice(3), FAMILY_PAYLOAD['playlist-page']);
    return payload && { action: 'playlist-page', guildId: null, payload };
  }

  if (action === 'liked' && parts[2] === 'page') {
    const payload = readFamily(parts.slice(3), FAMILY_PAYLOAD['liked-page']);
    return payload && { action: 'liked-page', guildId: null, payload };
  }

  if (action === 'liked' && parts[2] === 'clear') {
    const payload = readFamily(parts.slice(3), FAMILY_PAYLOAD['liked-clear']);
    return payload && { action: 'liked-clear', guildId: null, payload };
  }

  if (action.startsWith('voteskip-')) {
    return { action: 'voteskip', guildId: null, payload: { vote: action.slice('voteskip-'.length) } };
  }

  if (FAMILY_SEGMENTS[action]) {
    const guildId = parts[2];
    if (!guildId) return null;
    return { action, guildId, payload: {} };
  }

  return null;
}
