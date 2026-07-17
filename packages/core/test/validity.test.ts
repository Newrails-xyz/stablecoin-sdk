import { describe, expect, it } from 'vitest';
import { parseDuration, resolveValidity } from '../src/validity.js';

const NOW = 1_750_000_000n;

describe('parseDuration', () => {
  it('parses units', () => {
    expect(parseDuration('30s')).toBe(30n);
    expect(parseDuration('10m')).toBe(600n);
    expect(parseDuration('1h')).toBe(3600n);
    expect(parseDuration('7d')).toBe(604800n);
  });

  it('rejects invalid input', () => {
    expect(() => parseDuration('1w')).toThrow();
    expect(() => parseDuration('h')).toThrow();
    expect(() => parseDuration('-1h')).toThrow();
  });
});

describe('resolveValidity', () => {
  it('defaults to validAfter=0 and 1h validity (authorizations are irrevocable)', () => {
    expect(resolveValidity(undefined, NOW)).toEqual({ validAfter: 0n, validBefore: NOW + 3600n });
  });

  it('supports validFor', () => {
    expect(resolveValidity({ validFor: '10m' }, NOW)).toEqual({ validAfter: 0n, validBefore: NOW + 600n });
  });

  it('supports absolute timestamps', () => {
    expect(resolveValidity({ validAfter: NOW - 100n, validBefore: NOW + 100n }, NOW)).toEqual({
      validAfter: NOW - 100n,
      validBefore: NOW + 100n,
    });
  });

  it('rejects validFor together with validBefore', () => {
    expect(() => resolveValidity({ validFor: '1h', validBefore: NOW + 1n }, NOW)).toThrow();
  });

  it('rejects windows that are already closed or inverted', () => {
    expect(() => resolveValidity({ validBefore: NOW }, NOW)).toThrow();
    expect(() => resolveValidity({ validAfter: NOW + 200n, validBefore: NOW + 100n }, NOW)).toThrow();
  });
});
