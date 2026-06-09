import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_PRESETS, FILTER_LABELS, DEFAULT_FILTER } from '../src/utils/audio-filters.js';

const OBJECT_SLOTS = ['karaoke', 'timescale', 'tremolo', 'vibrato', 'rotation', 'distortion', 'channelMix', 'lowPass'];

describe('audio-filters', () => {
  it('DEFAULT_FILTER exists in FILTER_PRESETS', () => {
    assert.ok(FILTER_PRESETS[DEFAULT_FILTER], `DEFAULT_FILTER "${DEFAULT_FILTER}" missing from FILTER_PRESETS`);
  });

  it('every FILTER_LABELS key exists in FILTER_PRESETS', () => {
    for (const key of Object.keys(FILTER_LABELS)) {
      assert.ok(FILTER_PRESETS[key], `FILTER_LABELS key "${key}" missing from FILTER_PRESETS`);
    }
  });

  it('every FILTER_PRESETS key has matching FILTER_LABELS entry', () => {
    for (const key of Object.keys(FILTER_PRESETS)) {
      assert.ok(FILTER_LABELS[key], `FILTER_PRESETS key "${key}" missing from FILTER_LABELS`);
    }
  });

  it('every preset has equalizer array and all OBJECT_SLOTS defined', () => {
    for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
      assert.ok(Array.isArray(preset.equalizer), `"${name}".equalizer is not an array`);
      for (const slot of OBJECT_SLOTS) {
        assert.ok(Object.prototype.hasOwnProperty.call(preset, slot), `"${name}" missing slot "${slot}"`);
      }
    }
  });

  it('no EQ band gain exceeds the safe +0.45 ceiling', () => {
    const CEILING = 0.46; // slight buffer for fp comparison
    for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
      for (const b of preset.equalizer) {
        assert.ok(
          b.gain <= CEILING,
          `"${name}" band ${b.band} gain ${b.gain} exceeds safe ceiling ${CEILING - 0.01}`,
        );
      }
    }
  });

  it('no EQ band gain is below -0.25', () => {
    for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
      for (const b of preset.equalizer) {
        assert.ok(b.gain >= -0.25, `"${name}" band ${b.band} gain ${b.gain} below minimum -0.25`);
      }
    }
  });

  it('timescale speed stays in sane range [0.5, 2.0]', () => {
    for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
      if (!preset.timescale) continue;
      const { speed } = preset.timescale;
      if (speed !== undefined) {
        assert.ok(speed >= 0.5 && speed <= 2.0, `"${name}" timescale.speed ${speed} out of range [0.5, 2.0]`);
      }
    }
  });

  it('timescale pitch stays in sane range [0.5, 2.0]', () => {
    for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
      if (!preset.timescale) continue;
      const { pitch } = preset.timescale;
      if (pitch !== undefined) {
        assert.ok(pitch >= 0.5 && pitch <= 2.0, `"${name}" timescale.pitch ${pitch} out of range [0.5, 2.0]`);
      }
    }
  });
});
