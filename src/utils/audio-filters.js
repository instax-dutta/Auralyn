const band = (b, gain) => ({ band: b, gain });

// All FilterOptions slots known to Lavalink v4 — each preset overrides what it needs and
// explicitly nulls the rest, so switching presets is always a clean overwrite (shoukaku
// merges filter objects, so unset slots would otherwise persist from the previous preset).
const FILTER_SLOTS = ['equalizer', 'karaoke', 'timescale', 'tremolo', 'vibrato', 'rotation', 'distortion', 'channelMix', 'lowPass'];

function preset(overrides) {
  const out = {};
  for (const slot of FILTER_SLOTS) {
    out[slot] = Object.prototype.hasOwnProperty.call(overrides, slot) ? overrides[slot] : null;
  }
  return out;
}

export const FILTER_PRESETS = {
  flat: preset({}),

  balanced: preset({
    equalizer: [
      band(0,  0.05),
      band(1,  0.08),
      band(2,  0.07),
      band(3,  0.04),
      band(4,  0.02),
      band(5,  0.00),
      band(6, -0.01),
      band(7,  0.00),
      band(8,  0.00),
      band(9,  0.01),
      band(10, 0.02),
      band(11, 0.03),
      band(12, 0.04),
      band(13, 0.04),
      band(14, 0.03),
    ],
  }),

  // Bass Boost — Lavalink gain range is [-0.25, +1.0]. Previous values topped out at
  // +0.20 which is below the threshold of perception relative to baseline. These match
  // the gains commonly used by community bassboost presets and produce clearly audible
  // low-end emphasis without clipping.
  bass: preset({
    equalizer: [
      band(0,  0.65),
      band(1,  0.70),
      band(2,  0.60),
      band(3,  0.45),
      band(4,  0.25),
      band(5,  0.10),
      band(6,  0.00),
      band(7, -0.05),
      band(8, -0.05),
      band(9,  0.00),
      band(10, 0.00),
      band(11, 0.00),
      band(12, 0.00),
      band(13, 0.00),
      band(14, 0.00),
    ],
  }),

  treble: preset({
    equalizer: [
      band(0, -0.05),
      band(1, -0.03),
      band(2,  0.00),
      band(3,  0.00),
      band(4,  0.00),
      band(5,  0.00),
      band(6,  0.00),
      band(7,  0.05),
      band(8,  0.15),
      band(9,  0.25),
      band(10, 0.35),
      band(11, 0.40),
      band(12, 0.45),
      band(13, 0.45),
      band(14, 0.40),
    ],
  }),

  nightcore: preset({
    timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 },
  }),

  '8d': preset({
    rotation: { rotationHz: 0.2 },
  }),

  karaoke: preset({
    karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 },
  }),

  speed: preset({
    timescale: { speed: 1.25, pitch: 1.0, rate: 1.0 },
  }),

  // Genre EQ presets — tuned to industry-standard curves. Bands map to
  // ~25, 40, 63, 100, 160, 250, 400, 630, 1k, 1.6k, 2.5k, 4k, 6.3k, 10k, 16k Hz.
  classical: preset({
    equalizer: [
      band(0,  0.05),
      band(1,  0.05),
      band(2,  0.00),
      band(3, -0.02),
      band(4, -0.05),
      band(5, -0.05),
      band(6,  0.00),
      band(7,  0.05),
      band(8,  0.08),
      band(9,  0.10),
      band(10, 0.12),
      band(11, 0.15),
      band(12, 0.15),
      band(13, 0.12),
      band(14, 0.10),
    ],
  }),

  jazz: preset({
    equalizer: [
      band(0,  0.15),
      band(1,  0.15),
      band(2,  0.10),
      band(3,  0.05),
      band(4,  0.00),
      band(5, -0.02),
      band(6,  0.00),
      band(7,  0.05),
      band(8,  0.08),
      band(9,  0.10),
      band(10, 0.12),
      band(11, 0.15),
      band(12, 0.15),
      band(13, 0.12),
      band(14, 0.10),
    ],
  }),

  metal: preset({
    equalizer: [
      band(0,  0.20),
      band(1,  0.20),
      band(2,  0.15),
      band(3,  0.10),
      band(4,  0.00),
      band(5, -0.10),
      band(6, -0.05),
      band(7,  0.00),
      band(8,  0.10),
      band(9,  0.20),
      band(10, 0.25),
      band(11, 0.25),
      band(12, 0.20),
      band(13, 0.15),
      band(14, 0.10),
    ],
  }),

  pop: preset({
    equalizer: [
      band(0,  0.05),
      band(1,  0.10),
      band(2,  0.15),
      band(3,  0.20),
      band(4,  0.15),
      band(5,  0.10),
      band(6,  0.05),
      band(7,  0.00),
      band(8,  0.00),
      band(9,  0.05),
      band(10, 0.10),
      band(11, 0.15),
      band(12, 0.15),
      band(13, 0.10),
      band(14, 0.05),
    ],
  }),

  rock: preset({
    equalizer: [
      band(0,  0.25),
      band(1,  0.20),
      band(2,  0.15),
      band(3,  0.05),
      band(4, -0.05),
      band(5, -0.08),
      band(6, -0.05),
      band(7,  0.00),
      band(8,  0.05),
      band(9,  0.10),
      band(10, 0.20),
      band(11, 0.25),
      band(12, 0.25),
      band(13, 0.20),
      band(14, 0.15),
    ],
  }),
};

export const DEFAULT_FILTER = 'flat';

export const FILTER_LABELS = {
  flat:      '⏸️ Flat (no EQ)',
  balanced:  '🎚️ Balanced',
  bass:      '🔊 Bass Boost',
  treble:    '🔔 Treble Boost',
  nightcore: '🌙 Nightcore',
  '8d':      '🌀 8D Audio',
  karaoke:   '🎤 Karaoke',
  speed:     '⚡ Speed Up',
  classical: '🎻 Classical',
  jazz:      '🎷 Jazz',
  metal:     '🤘 Metal',
  pop:       '🎵 Pop',
  rock:      '🎸 Rock',
};
