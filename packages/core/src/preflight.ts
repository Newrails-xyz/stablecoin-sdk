import type { StablecoinErrorInfo } from './errors.js';
import { ROLES } from './roles.js';
import type {
  Address,
  BurnAuthorizationMessage,
  Bytes32,
  TransferAuthorizationMessage,
} from './types.js';

export type PreflightAction =
  | { kind: 'transfer'; from: Address; to: Address; value: bigint }
  | { kind: 'transferWithAuthorization'; message: TransferAuthorizationMessage }
  | { kind: 'receiveWithAuthorization'; message: TransferAuthorizationMessage; caller: Address }
  | { kind: 'burnFromWithAuthorization'; message: BurnAuthorizationMessage; caller: Address };

export interface PreflightResult {
  ok: boolean;
  /** All failure reasons (same shape as revert decoding), not just the first one. */
  failures: StablecoinErrorInfo[];
}

/** The minimal read capability preflight needs (provided by client.read, convenient for unit-test doubles). */
export interface PreflightReads {
  paused(): Promise<boolean>;
  isBlacklisted(account: Address): Promise<boolean>;
  balanceOf(account: Address): Promise<bigint>;
  authorizationState(authorizer: Address, nonce: Bytes32): Promise<boolean>;
  hasRole(role: Bytes32, account: Address): Promise<boolean>;
}

/**
 * Pre-transaction static checks, turning "reverts only on-chain" into a readable list of errors up front.
 * Note: the time window uses the local clock to approximate on-chain block.timestamp, so near boundary values (second-level) it may still fail on-chain.
 */
export async function preflight(
  reads: PreflightReads,
  action: PreflightAction,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<PreflightResult> {
  const failures: StablecoinErrorInfo[] = [];

  if (await reads.paused()) {
    failures.push({ name: 'EnforcedPause', args: {}, message: 'token is paused' });
  }

  const checkBlacklist = async (account: Address) => {
    if (await reads.isBlacklisted(account)) {
      failures.push({ name: 'Blacklisted', args: { account }, message: `account ${account} is blacklisted` });
    }
  };

  const checkBalance = async (account: Address, needed: bigint) => {
    const balance = await reads.balanceOf(account);
    if (balance < needed) {
      failures.push({
        name: 'ERC20InsufficientBalance',
        args: { sender: account, balance, needed },
        message: `insufficient balance: have ${balance}, need ${needed}`,
      });
    }
  };

  // The contract uses strict comparison: block.timestamp must be > validAfter and < validBefore.
  const checkWindow = (message: { validAfter: bigint; validBefore: bigint }) => {
    if (nowSeconds <= message.validAfter) {
      failures.push({
        name: 'AuthorizationNotYetValid',
        args: { validAfter: message.validAfter, currentTime: nowSeconds },
        message: `authorization valid only after ${message.validAfter} (now ${nowSeconds})`,
      });
    }
    if (nowSeconds >= message.validBefore) {
      failures.push({
        name: 'AuthorizationExpired',
        args: { validBefore: message.validBefore, currentTime: nowSeconds },
        message: `authorization expired at ${message.validBefore} (now ${nowSeconds})`,
      });
    }
  };

  const checkNonce = async (authorizer: Address, nonce: Bytes32) => {
    if (await reads.authorizationState(authorizer, nonce)) {
      failures.push({
        name: 'AuthorizationAlreadyUsed',
        args: { authorizer, nonce },
        message: `authorization nonce ${nonce} of ${authorizer} already used`,
      });
    }
  };

  switch (action.kind) {
    case 'transfer': {
      await checkBlacklist(action.from);
      await checkBlacklist(action.to);
      await checkBalance(action.from, action.value);
      break;
    }
    case 'transferWithAuthorization':
    case 'receiveWithAuthorization': {
      const m = action.message;
      await checkBlacklist(m.from);
      await checkBlacklist(m.to);
      await checkBalance(m.from, m.value);
      checkWindow(m);
      await checkNonce(m.from, m.nonce);
      if (action.kind === 'receiveWithAuthorization' && action.caller.toLowerCase() !== m.to.toLowerCase()) {
        failures.push({
          name: 'ReceiveAuthorizationCallerMismatch',
          args: {},
          message: 'receiveWithAuthorization caller must equal `to`',
        });
      }
      break;
    }
    case 'burnFromWithAuthorization': {
      const m = action.message;
      await checkBlacklist(m.from);
      await checkBalance(m.from, m.value);
      checkWindow(m);
      await checkNonce(m.from, m.nonce);
      if (!(await reads.hasRole(ROLES.BURNER_ROLE, action.caller))) {
        failures.push({
          name: 'AccessControlUnauthorizedAccount',
          args: { account: action.caller, neededRole: ROLES.BURNER_ROLE },
          message: `account ${action.caller} is missing BURNER_ROLE`,
        });
      }
      break;
    }
  }

  return { ok: failures.length === 0, failures };
}
