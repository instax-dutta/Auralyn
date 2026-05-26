const band = (b, gain) => ({ band: b, gain });

// All FilterOptions slots known to Lavalink v4. Each preset overrides what it needs;
// the helper fills in clearing values for the rest so switching presets is a clean
// overwrite (shoukaku merges filter objects, so unset slots would otherwise persist).
//
// IMPORTANT: Lavalink v4's kotlinx serializer treats `equalizer` as a non-nullable
// List<Band> — sending `null` produces a 400 ("ArrayList was not nullable but null
// mark was encountered"). Use an empty array to clear EQ. Object-type slots
// (karaoke / timescale / etc.) ARE nullable and use `null` to clear.
const OBJECT_SLOTS = ['karaoke', 'timescale', 'tremolo', 'vibrato', 'rotation', 'distortion', 'channelMix', 'lowPass'];

function preset(overrides) {
  const out = {
    equalizer: Object.prototype.hasOwnProperty.call(overrides, 'equalizer') ? overrides.equalizer : [],
  };
  for (const slot of OBJECT_SLOTS) {
    out[slot] = Object.prototype.hasOwnProperty.call(overrides, slot) ? overrides[slot] : null;
  }
  return out;
}

// Lavalink 15-band EQ frequency centers (approx):
//   0: 25 Hz   1: 40 Hz   2: 63 Hz    3: 100 Hz   4: 160 Hz
//   5: 250 Hz  6: 400 Hz  7: 630 Hz   8: 1 kHz    9: 1.6 kHz
//  10: 2.5 kHz 11: 4 kHz  12: 6.3 kHz 13: 10 kHz 14: 16 kHz
// Gain range: [-0.25, +1.0]. ~+0.25 ≈ +6 dB.

export const FILTER_PRESETS = {
  // No-EQ baseline. Empty equalizer + null object slots = full reset.
  flat: preset({}),

  // Gentle "smile" — corrects typical Discord opus dullness without colouring.
  balanced: preset({
    equalizer: [
      band(0,  0.08),
      band(1,  0.10),
      band(2,  0.08),
      band(3,  0.05),
      band(4,  0.02),
      band(5,  0.00),
      band(6, -0.02),
      band(7, -0.02),
      band(8,  0.00),
      band(9,  0.02),
      band(10, 0.04),
      band(11, 0.06),
      band(12, 0.06),
      band(13, 0.05),
      band(14, 0.04),
    ],
  }),

  // Heavy low-end emphasis with a slight 630–1k dip to keep bass from muddying vocals.
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

  // High-shelf lift starting around 1.6k. Capped at +0.40 to avoid sibilance.
  treble: preset({
    equalizer: [
      band(0, -0.05),
      band(1, -0.03),
      band(2,  0.00),
      band(3,  0.00),
      band(4,  0.00),
      band(5,  0.00),
      band(6,  0.02),
      band(7,  0.08),
      band(8,  0.18),
      band(9,  0.28),
      band(10, 0.35),
      band(11, 0.40),
      band(12, 0.40),
      band(13, 0.35),
      band(14, 0.30),
    ],
  }),

  // Classical — refined, slight bass softness, gentle upper-mid air for strings.
  classical: preset({
    equalizer: [
      band(0,  0.00),
      band(1,  0.05),
      band(2,  0.05),
      band(3,  0.00),
      band(4, -0.02),
      band(5, -0.05),
      band(6, -0.05),
      band(7,  0.00),
      band(8,  0.05),
      band(9,  0.08),
      band(10, 0.10),
      band(11, 0.12),
      band(12, 0.12),
      band(13, 0.10),
      band(14, 0.08),
    ],
  }),

  // Jazz — warm low end, smooth mids, gentle 2.5k–4k lift for horns / cymbals.
  jazz: preset({
    equalizer: [
      band(0,  0.15),
      band(1,  0.18),
      band(2,  0.15),
      band(3,  0.08),
      band(4,  0.00),
      band(5, -0.02),
      band(6,  0.00),
      band(7,  0.05),
      band(8,  0.08),
      band(9,  0.10),
      band(10, 0.10),
      band(11, 0.12),
      band(12, 0.10),
      band(13, 0.08),
      band(14, 0.05),
    ],
  }),

  // Metal — scooped V-curve with mid-bass thump and biting 2.5k–4k presence.
  metal: preset({
    equalizer: [
      band(0,  0.25),
      band(1,  0.28),
      band(2,  0.22),
      band(3,  0.10),
      band(4, -0.05),
      band(5, -0.12),
      band(6, -0.10),
      band(7, -0.05),
      band(8,  0.05),
      band(9,  0.18),
      band(10, 0.28),
      band(11, 0.30),
      band(12, 0.25),
      band(13, 0.18),
      band(14, 0.10),
    ],
  }),

  // Pop — vocal-forward. Lift 100–250 Hz for warmth and 1k–2.5k for vocal clarity.
  pop: preset({
    equalizer: [
      band(0,  0.05),
      band(1,  0.08),
      band(2,  0.12),
      band(3,  0.15),
      band(4,  0.10),
      band(5,  0.05),
      band(6,  0.05),
      band(7,  0.10),
      band(8,  0.12),
      band(9,  0.10),
      band(10, 0.08),
      band(11, 0.10),
      band(12, 0.10),
      band(13, 0.05),
      band(14, 0.02),
    ],
  }),

  // Rock — classic V-curve. Big kick + bass, scooped low-mids, biting presence.
  rock: preset({
    equalizer: [
      band(0,  0.20),
      band(1,  0.25),
      band(2,  0.20),
      band(3,  0.10),
      band(4,  0.00),
      band(5, -0.08),
      band(6, -0.10),
      band(7, -0.05),
      band(8,  0.05),
      band(9,  0.15),
      band(10, 0.22),
      band(11, 0.25),
      band(12, 0.22),
      band(13, 0.15),
      band(14, 0.10),
    ],
  }),

  // Classic nightcore: ~1.25× speed and pitch together.
  nightcore: preset({
    timescale: { speed: 1.25, pitch: 1.25, rate: 1.0 },
  }),

  // Standard 8D rotation rate. 0.2 Hz = one full pan every 5s.
  '8d': preset({
    rotation: { rotationHz: 0.2 },
  }),

  // Center-channel vocal cancellation tuned to typical vocal band.
  karaoke: preset({
    karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 },
  }),

  // Speed up without raising pitch (chipmunk-free fast playback).
  speed: preset({
    timescale: { speed: 1.25, pitch: 1.0, rate: 1.0 },
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
