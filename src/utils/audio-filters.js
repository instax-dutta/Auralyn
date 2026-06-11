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
// Gain range: [-0.25, +1.0]. ~+0.25 ≈ +6 dB. Safe ceiling for non-extreme: 0.22.

export const FILTER_PRESETS = {
  // True bypass — empty EQ, all slots cleared. Lavalink raw output.
  flat: preset({}),

  // Hi-fi codec compensation — the recommended starting point for Discord playback.
  // Discord opus at 96-128 kbps introduces:
  //   - Sub-bass muddiness (25-63 Hz) → gentle cut
  //   - Boxy resonance at 250-400 Hz → notch reduction
  //   - Midrange preserved well → leave mostly flat
  //   - High-frequency rolloff above 10 kHz → air shelf lift
  // The result is fuller, cleaner, more "open" sound vs raw flat.
  balanced: preset({
    equalizer: [
      band(0,  -0.03), // 25 Hz  — reduce sub mud codec can't handle cleanly
      band(1,  -0.02), // 40 Hz  — subtle
      band(2,   0.00), // 63 Hz  — neutral
      band(3,   0.04), // 100 Hz — slight punch warmth
      band(4,   0.03), // 160 Hz — body
      band(5,  -0.03), // 250 Hz — cut codec boxiness
      band(6,  -0.04), // 400 Hz — reduce room resonance artifacts
      band(7,  -0.02), // 630 Hz — slight hollow cut
      band(8,   0.02), // 1 kHz  — neutral/clarity start
      band(9,   0.05), // 1.6 kHz — presence
      band(10,  0.06), // 2.5 kHz — vocal/detail lift
      band(11,  0.04), // 4 kHz  — detail (kept gentle to avoid sibilance)
      band(12,  0.04), // 6.3 kHz — air start
      band(13,  0.07), // 10 kHz  — air shelf (compensates codec rolloff)
      band(14,  0.06), // 16 kHz  — open/airy
    ],
  }),

  // Bass — punch-forward, not sub-forward.
  // Peak at 100-160 Hz (kick body + bass guitar); sub kept modest to avoid codec graininess.
  // Dip at 400-630 Hz keeps vocals from muddying.
  bass: preset({
    equalizer: [
      band(0,   0.05), // 25 Hz  — modest sub
      band(1,   0.09), // 40 Hz  — sub warmth
      band(2,   0.14), // 63 Hz  — deep bass body
      band(3,   0.20), // 100 Hz — PEAK: kick punch
      band(4,   0.18), // 160 Hz — upper bass
      band(5,   0.08), // 250 Hz — transition
      band(6,  -0.02), // 400 Hz — protect vocals
      band(7,  -0.05), // 630 Hz — protect vocals
      band(8,  -0.03), // 1 kHz  — keep space for mids
      band(9,   0.00),
      band(10,  0.00),
      band(11,  0.00),
      band(12,  0.00),
      band(13,  0.00),
      band(14,  0.00),
    ],
  }),

  // Treble — presence + air lift. Starts gently at 1 kHz, peaks in the air band.
  // Sub slightly reduced so bass doesn't fight the lifted highs.
  treble: preset({
    equalizer: [
      band(0,  -0.04), // 25 Hz  — reduce sub to balance
      band(1,  -0.03), // 40 Hz
      band(2,  -0.02), // 63 Hz
      band(3,   0.00), // 100 Hz
      band(4,   0.00), // 160 Hz
      band(5,  -0.02), // 250 Hz — slight warmth cut
      band(6,   0.02), // 400 Hz
      band(7,   0.05), // 630 Hz — presence start
      band(8,   0.09), // 1 kHz
      band(9,   0.14), // 1.6 kHz
      band(10,  0.19), // 2.5 kHz
      band(11,  0.19), // 4 kHz  — kept below 0.20 to avoid harshness
      band(12,  0.20), // 6.3 kHz
      band(13,  0.22), // 10 kHz — air
      band(14,  0.20), // 16 kHz — open
    ],
  }),

  // Classical — concert hall character. Transparent mids, gentle warmth, airy highs.
  // Mild cut at 250-400 Hz removes boxy resonance common in live recordings.
  classical: preset({
    equalizer: [
      band(0,   0.00),
      band(1,   0.02),
      band(2,   0.04), // slight warmth
      band(3,   0.02),
      band(4,   0.00),
      band(5,  -0.04), // cut boxiness
      band(6,  -0.05), // room resonance
      band(7,  -0.02),
      band(8,   0.02),
      band(9,   0.06), // string presence
      band(10,  0.09),
      band(11,  0.10), // brilliance
      band(12,  0.10),
      band(13,  0.09), // air
      band(14,  0.06),
    ],
  }),

  // Jazz — warm, intimate, upright-bass richness + smooth horn presence.
  jazz: preset({
    equalizer: [
      band(0,   0.07), // upright bass sub
      band(1,   0.10), // sub warmth
      band(2,   0.10), // bass body
      band(3,   0.07), // warmth
      band(4,   0.03),
      band(5,  -0.03), // cut mud
      band(6,   0.00),
      band(7,   0.04), // slight presence
      band(8,   0.06), // horn body
      band(9,   0.09), // horn/piano presence
      band(10,  0.10), // detail
      band(11,  0.09), // cymbal shimmer
      band(12,  0.07),
      band(13,  0.05),
      band(14,  0.03),
    ],
  }),

  // Metal — scooped V-curve. Sub/kick thump, deep low-mid scoop, biting presence.
  // Scoop kept below the punch band so kick still sounds thick, not thin.
  metal: preset({
    equalizer: [
      band(0,   0.14), // sub kick
      band(1,   0.17), // kick punch
      band(2,   0.13), // bass guitar
      band(3,   0.06), // transition
      band(4,  -0.03), // scoop start
      band(5,  -0.12), // deep scoop
      band(6,  -0.10), // scoop
      band(7,  -0.05), // transition
      band(8,   0.04),
      band(9,   0.12), // presence start
      band(10,  0.17), // attack
      band(11,  0.17), // edge
      band(12,  0.13), // crunch
      band(13,  0.09), // air
      band(14,  0.05),
    ],
  }),

  // Pop — vocal-forward, clear and bright. Slight sub reduction, presence peak at 1-2.5 kHz.
  pop: preset({
    equalizer: [
      band(0,  -0.02), // reduce sub slightly
      band(1,   0.00),
      band(2,   0.04), // warmth
      band(3,   0.05), // body
      band(4,   0.04),
      band(5,   0.00),
      band(6,   0.02),
      band(7,   0.07), // vocal body
      band(8,   0.10), // vocal clarity
      band(9,   0.09), // presence
      band(10,  0.07), // detail
      band(11,  0.06),
      band(12,  0.06),
      band(13,  0.05),
      band(14,  0.03),
    ],
  }),

  // Rock — V-curve. Bass punch, low-mid scoop, guitar presence + pick attack.
  rock: preset({
    equalizer: [
      band(0,   0.10), // sub kick
      band(1,   0.14), // kick punch
      band(2,   0.12), // bass guitar
      band(3,   0.06), // warmth
      band(4,   0.00),
      band(5,  -0.07), // scoop
      band(6,  -0.08), // scoop
      band(7,  -0.04), // transition
      band(8,   0.03),
      band(9,   0.10), // presence
      band(10,  0.14), // guitar attack
      band(11,  0.14), // edge
      band(12,  0.12), // crunch
      band(13,  0.09), // air
      band(14,  0.05),
    ],
  }),

  // Nightcore — 1.20× speed + pitch. Smoother than 1.25 (less chipmunk edge).
  nightcore: preset({
    timescale: { speed: 1.20, pitch: 1.20, rate: 1.0 },
  }),

  // 8D — rotating stereo panning at 0.2 Hz (one full pan every 5s).
  '8d': preset({
    rotation: { rotationHz: 0.2 },
  }),

  // Karaoke — center-channel vocal suppression.
  // Band centred at 270 Hz, 150 Hz width catches vocal fundamentals.
  karaoke: preset({
    karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 270.0, filterWidth: 150.0 },
  }),

  // Speed — 1.25× speed only, pitch unchanged (no chipmunk effect).
  speed: preset({
    timescale: { speed: 1.25, pitch: 1.0, rate: 1.0 },
  }),

  // Lo-fi — slightly slowed + warm low-pass. lowPass smoothing 15 = natural warmth.
  lofi: preset({
    timescale: { speed: 0.85, pitch: 1.0, rate: 1.0 },
    lowPass: { smoothing: 15.0 },
  }),

  // Daycore — gently slowed with subtle pitch drop. Softer than slowed.
  daycore: preset({
    timescale: { speed: 0.80, pitch: 0.95, rate: 1.0 },
  }),

  // Slowed — slowed + pitch drop together. "Slowed + reverb" vibe.
  slowed: preset({
    timescale: { speed: 0.75, pitch: 0.85, rate: 1.0 },
  }),

  // Slowmo — extreme slow, pitch preserved.
  slowmo: preset({
    timescale: { speed: 0.65, pitch: 1.0, rate: 1.0 },
  }),

  // Speed Up — 1.5× speed only.
  speedup: preset({
    timescale: { speed: 1.5, pitch: 1.0, rate: 1.0 },
  }),

  // Vaporwave — slowed + pitch down + subtle sub-bass warmth. Solo preset.
  vaporwave: preset({
    timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 },
    equalizer: [
      band(0,  0.08),
      band(1,  0.10),
      band(2,  0.06),
    ],
  }),

  // Chipmunk — +5 semitones, slight speed nudge. Distinct but not painful.
  chipmunk: preset({
    timescale: { speed: 1.05, pitch: 1.25, rate: 1.0 },
  }),

  // Darth Vader — -6 semitones (0.65 pitch), natural speed. No distortion.
  darthvader: preset({
    timescale: { speed: 1.0, pitch: 0.65, rate: 1.0 },
  }),

  // Vibration — gentle periodic wobble matching natural voice vibrato.
  // 6 Hz + 0.35 depth avoids nausea; tremolo at 4 Hz is subtle.
  vibration: preset({
    vibrato: { frequency: 6.0, depth: 0.35 },
    tremolo: { frequency: 4.0, depth: 0.20 },
  }),

  // Terrible Bass — joke/extreme preset. Sub-forward but capped to prevent total clip.
  // Intentionally boomy; solo-only so it doesn't stack with other effects.
  terriblebass: preset({
    equalizer: [
      band(0,   0.20), // reduced vs naive approach — still hits hard
      band(1,   0.28),
      band(2,   0.35), // PEAK: bass body
      band(3,   0.28), // punch
      band(4,   0.14),
      band(5,  -0.05),
      band(6,  -0.05),
    ],
  }),

  // Bass Low — subtle lift, good for background or already-mastered tracks.
  bass_low: preset({
    equalizer: [
      band(0,   0.04),
      band(1,   0.07),
      band(2,   0.10),
      band(3,   0.12), // peak
      band(4,   0.09),
      band(5,   0.03),
    ],
  }),

  // Bass High — strong but sub-controlled. Peak at 100-160 Hz, not 25 Hz.
  bass_high: preset({
    equalizer: [
      band(0,   0.10),
      band(1,   0.16),
      band(2,   0.24),
      band(3,   0.32), // peak: punch
      band(4,   0.28),
      band(5,   0.16),
      band(6,   0.04),
      band(7,  -0.04),
      band(8,  -0.04),
    ],
  }),
};

// Default applied on session start — balanced compensates for Discord opus codec losses.
// Users can override to flat for true bypass.
export const DEFAULT_FILTER = 'balanced';

export const PRESET_LAYER = {
  flat:         'eq',
  balanced:     'eq',
  bass:         'eq',
  bass_low:     'eq',
  bass_high:    'eq',
  treble:       'eq',
  classical:    'eq',
  jazz:         'eq',
  metal:        'eq',
  pop:          'eq',
  rock:         'eq',
  terriblebass: 'eq',
  nightcore:    'timescale',
  daycore:      'timescale',
  slowed:       'timescale',
  slowmo:       'timescale',
  speedup:      'timescale',
  chipmunk:     'timescale',
  darthvader:   'timescale',
  speed:        'timescale',
  lofi:         'timescale',
  vaporwave:    'timescale',
  '8d':         'rotation',
  karaoke:      'karaoke',
  vibration:    'vibrato',
};

export const FILTER_LABELS = {
  flat:         '⏸️ Flat (bypass)',
  balanced:     '🎚️ Balanced',
  bass:         '🔊 Bass Boost',
  treble:       '🔔 Treble Boost',
  nightcore:    '🌙 Nightcore',
  '8d':         '🌀 8D Audio',
  karaoke:      '🎤 Karaoke',
  speed:        '⚡ Speed Up',
  classical:    '🎻 Classical',
  jazz:         '🎷 Jazz',
  metal:        '🤘 Metal',
  pop:          '🎵 Pop',
  rock:         '🎸 Rock',
  lofi:         '📻 Lo-Fi',
  daycore:      '🌤️ Daycore',
  slowed:       '🐢 Slowed',
  slowmo:       '🔬 Slow Motion',
  speedup:      '🚀 Speed Up+',
  vaporwave:    '🌊 Vaporwave',
  chipmunk:     '🐿️ Chipmunk',
  darthvader:   '😈 Darth Vader',
  vibration:    '〰️ Vibration',
  terriblebass: '💀 Terrible Bass',
  bass_low:     '🔉 Bass Low',
  bass_high:    '🔈 Bass High',
};
