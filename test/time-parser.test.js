import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHumanDuration } from '../src/utils/time-parser.js';

describe('parseHumanDuration', () => {
  it('parses bare seconds', () => assert.equal(parseHumanDuration('45'), 45_000));
  it('parses minutes only', () => assert.equal(parseHumanDuration('10m'), 600_000));
  it('parses hours only', () => assert.equal(parseHumanDuration('1h'), 3_600_000));
  it('parses hours + minutes', () => assert.equal(parseHumanDuration('1h30m'), 5_400_000));
  it('parses hours + minutes + seconds', () => assert.equal(parseHumanDuration('2h15m30s'), 8_130_000));
  it('parses seconds only suffix', () => assert.equal(parseHumanDuration('90s'), 90_000));
  it('returns null on empty string', () => assert.equal(parseHumanDuration(''), null));
  it('returns null on null', () => assert.equal(parseHumanDuration(null), null));
  it('returns null on alphabetic garbage', () => assert.equal(parseHumanDuration('abc'), null));
  it('returns null on negative string', () => assert.equal(parseHumanDuration('-10m'), null));
  it('returns null on zero duration', () => assert.equal(parseHumanDuration('0m'), null));
  it('is case-insensitive', () => assert.equal(parseHumanDuration('1H30M'), 5_400_000));
});
