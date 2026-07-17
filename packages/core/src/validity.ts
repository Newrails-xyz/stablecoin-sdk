import type { AuthorizationValidity } from './types.js';

export const DEFAULT_VALID_FOR = '1h';

const DURATION_RE = /^(\d+)(s|m|h|d)$/;
const UNIT_SECONDS: Record<string, bigint> = { s: 1n, m: 60n, h: 3600n, d: 86400n };

/** Parse "30s" | "10m" | "1h" | "7d" into a number of seconds. */
export function parseDuration(duration: string): bigint {
  const match = DURATION_RE.exec(duration);
  if (!match) {
    throw new Error(`invalid duration "${duration}", expected e.g. "30s", "10m", "1h", "7d"`);
  }
  return BigInt(match[1]) * UNIT_SECONDS[match[2]];
}

/**
 * Resolve authorization validity into absolute timestamps. Default validFor = "1h" (authorizations are irrevocable, see DESIGN.md §4).
 * Note the contract uses strict comparison (timestamp must be > validAfter and < validBefore).
 */
export function resolveValidity(
  validity?: AuthorizationValidity,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): { validAfter: bigint; validBefore: bigint } {
  if (validity?.validFor !== undefined && validity?.validBefore !== undefined) {
    throw new Error('specify either validFor or validBefore, not both');
  }

  const validAfter = validity?.validAfter ?? 0n;
  const validBefore =
    validity?.validBefore ?? nowSeconds + parseDuration(validity?.validFor ?? DEFAULT_VALID_FOR);

  if (validBefore <= nowSeconds) {
    throw new Error(`validBefore (${validBefore}) is not in the future (now ${nowSeconds})`);
  }
  if (validAfter >= validBefore) {
    throw new Error(`validAfter (${validAfter}) must be earlier than validBefore (${validBefore})`);
  }
  return { validAfter, validBefore };
}
