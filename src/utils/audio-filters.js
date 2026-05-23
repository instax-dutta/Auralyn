const band = (b, gain) => ({ band: b, gain });

export const FILTER_PRESETS = {
  flat: {},

  balanced: {
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
  },

  bass: {
    equalizer: [
      band(0,  0.15),
      band(1,  0.20),
      band(2,  0.18),
      band(3,  0.12),
      band(4,  0.08),
      band(5,  0.03),
      band(6,  0.00),
      band(7, -0.02),
      band(8, -0.02),
      band(9,  0.00),
      band(10, 0.00),
      band(11, 0.00),
      band(12, 0.00),
      band(13, 0.00),
      band(14, 0.00),
    ],
  },

  treble: {
    equalizer: [
      band(0, -0.03),
      band(1, -0.02),
      band(2,  0.00),
      band(3,  0.00),
      band(4,  0.00),
      band(5,  0.00),
      band(6,  0.00),
      band(7,  0.00),
      band(8,  0.02),
      band(9,  0.04),
      band(10, 0.06),
      band(11, 0.08),
      band(12, 0.10),
      band(13, 0.10),
      band(14, 0.08),
    ],
  },

  nightcore: {
    timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 },
  },

  '8d': {
    rotation: { rotationHz: 0.2 },
  },

  karaoke: {
    karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 },
  },

  speed: {
    timescale: { speed: 1.25, pitch: 1.0, rate: 1.0 },
  },
};

export const DEFAULT_FILTER = 'flat';

export const FILTER_LABELS = {
  flat:      'Flat (no EQ)',
  balanced:  'Balanced',
  bass:      'Bass Boost',
  treble:    'Treble Boost',
  nightcore: 'Nightcore',
  '8d':      '8D Audio',
  karaoke:   'Karaoke',
  speed:     'Speed Up',
};
