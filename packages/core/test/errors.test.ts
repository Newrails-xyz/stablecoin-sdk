import { describe, expect, it } from 'vitest';
import { encodeErrorResult } from 'viem';
import { STABLECOIN_ERRORS_ABI, decodeStablecoinError } from '../src/errors.js';

describe('decodeStablecoinError', () => {
  it('decodes AuthorizationExpired with named args', () => {
    const data = encodeErrorResult({
      abi: STABLECOIN_ERRORS_ABI,
      errorName: 'AuthorizationExpired',
      args: [1750000000n, 1750003600n],
    });
    const decoded = decodeStablecoinError(data);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('AuthorizationExpired');
    expect(decoded!.args).toEqual({ validBefore: 1750000000n, currentTime: 1750003600n });
    expect(decoded!.message).toContain('expired');
  });

  it('decodes Blacklisted', () => {
    const account = '0x00000000000000000000000000000000000000aa';
    const data = encodeErrorResult({ abi: STABLECOIN_ERRORS_ABI, errorName: 'Blacklisted', args: [account] });
    const decoded = decodeStablecoinError(data);
    expect(decoded!.name).toBe('Blacklisted');
    expect((decoded!.args.account as string).toLowerCase()).toBe(account);
  });

  it('decodes zero-arg errors', () => {
    const data = encodeErrorResult({ abi: STABLECOIN_ERRORS_ABI, errorName: 'EnforcedPause', args: [] });
    expect(decodeStablecoinError(data)!.name).toBe('EnforcedPause');
  });

  it('returns null for unknown revert data', () => {
    expect(decodeStablecoinError('0xdeadbeef')).toBeNull();
  });
});
