import { BaseError, ContractFunctionRevertedError, decodeErrorResult, parseAbi } from 'viem';
import type { Hex } from './types.js';

/**
 * Custom errors decodable through the SDK's read / transfer / permit / authorization paths,
 * including the OZ ERC20, ECDSA and permit-nonce errors these paths can surface. Admin- and
 * upgrade-only errors (UUPS / ERC1967 / Initializable) are intentionally omitted.
 */
export const STABLECOIN_ERRORS_ABI = parseAbi([
  'error MinterAllowanceExceeded(uint256 requested, uint256 available)',
  'error InvalidAddress()',
  'error NativeTransferFailed()',
  'error AuthorizationAlreadyUsed(address authorizer, bytes32 nonce)',
  'error AuthorizationNotYetValid(uint256 validAfter, uint256 currentTime)',
  'error AuthorizationExpired(uint256 validBefore, uint256 currentTime)',
  'error InvalidAuthorizationSignature()',
  'error ReceiveAuthorizationCallerMismatch()',
  'error Blacklisted(address account)',
  'error EnforcedPause()',
  'error ExpectedPause()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC2612ExpiredSignature(uint256 deadline)',
  'error ERC2612InvalidSigner(address signer, address owner)',
  // OZ ERC20 / ECDSA / permit-nonce errors reachable via transfer, approve, permit and authorization paths.
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidApprover(address approver)',
  'error ERC20InvalidSpender(address spender)',
  'error ECDSAInvalidSignature()',
  'error ECDSAInvalidSignatureLength(uint256 length)',
  'error ECDSAInvalidSignatureS(bytes32 s)',
  'error InvalidAccountNonce(address account, uint256 currentNonce)',
]);

export type StablecoinErrorName =
  | 'MinterAllowanceExceeded'
  | 'InvalidAddress'
  | 'NativeTransferFailed'
  | 'AuthorizationAlreadyUsed'
  | 'AuthorizationNotYetValid'
  | 'AuthorizationExpired'
  | 'InvalidAuthorizationSignature'
  | 'ReceiveAuthorizationCallerMismatch'
  | 'Blacklisted'
  | 'EnforcedPause'
  | 'ExpectedPause'
  | 'AccessControlUnauthorizedAccount'
  | 'ERC20InsufficientBalance'
  | 'ERC20InsufficientAllowance'
  | 'ERC2612ExpiredSignature'
  | 'ERC2612InvalidSigner'
  | 'ERC20InvalidReceiver'
  | 'ERC20InvalidSender'
  | 'ERC20InvalidApprover'
  | 'ERC20InvalidSpender'
  | 'ECDSAInvalidSignature'
  | 'ECDSAInvalidSignatureLength'
  | 'ECDSAInvalidSignatureS'
  | 'InvalidAccountNonce';

export interface StablecoinErrorInfo {
  name: StablecoinErrorName;
  args: Record<string, unknown>;
  /** Readable message for integrator logs/UI. */
  message: string;
}

const MESSAGES: Record<StablecoinErrorName, (args: Record<string, unknown>) => string> = {
  MinterAllowanceExceeded: (a) => `mint amount ${a.requested} exceeds minter allowance ${a.available}`,
  InvalidAddress: () => 'zero address is not allowed',
  NativeTransferFailed: () => 'native token transfer failed',
  AuthorizationAlreadyUsed: (a) => `authorization nonce ${a.nonce} of ${a.authorizer} already used`,
  AuthorizationNotYetValid: (a) => `authorization valid only after ${a.validAfter} (now ${a.currentTime})`,
  AuthorizationExpired: (a) => `authorization expired at ${a.validBefore} (now ${a.currentTime})`,
  InvalidAuthorizationSignature: () => 'authorization signature is invalid',
  ReceiveAuthorizationCallerMismatch: () => 'receiveWithAuthorization caller must equal `to`',
  Blacklisted: (a) => `account ${a.account} is blacklisted`,
  EnforcedPause: () => 'token is paused',
  ExpectedPause: () => 'token is not paused',
  AccessControlUnauthorizedAccount: (a) => `account ${a.account} is missing role ${a.neededRole}`,
  ERC20InsufficientBalance: (a) => `insufficient balance: have ${a.balance}, need ${a.needed}`,
  ERC20InsufficientAllowance: (a) => `insufficient allowance: have ${a.allowance}, need ${a.needed}`,
  ERC2612ExpiredSignature: (a) => `permit expired at ${a.deadline}`,
  ERC2612InvalidSigner: (a) => `permit signed by ${a.signer}, expected ${a.owner}`,
  ERC20InvalidReceiver: (a) => `invalid transfer recipient ${a.receiver}`,
  ERC20InvalidSender: (a) => `invalid transfer sender ${a.sender}`,
  ERC20InvalidApprover: (a) => `invalid approval owner ${a.approver}`,
  ERC20InvalidSpender: (a) => `invalid approval spender ${a.spender}`,
  ECDSAInvalidSignature: () => 'signature is malformed (invalid ECDSA signature)',
  ECDSAInvalidSignatureLength: (a) => `signature has invalid length ${a.length}`,
  ECDSAInvalidSignatureS: (a) => `signature has invalid s value ${a.s}`,
  InvalidAccountNonce: (a) => `wrong nonce for ${a.account}: current on-chain nonce is ${a.currentNonce}`,
};

/** Decode revert data into a typed error; returns null if it can't be decoded (the caller falls back to the raw error). */
export function decodeStablecoinError(revertData: Hex): StablecoinErrorInfo | null {
  try {
    const decoded = decodeErrorResult({ abi: STABLECOIN_ERRORS_ABI, data: revertData });
    const name = decoded.errorName as StablecoinErrorName;
    const inputs = decoded.abiItem.inputs ?? [];
    const args: Record<string, unknown> = {};
    inputs.forEach((input, i) => {
      args[input.name ?? `arg${i}`] = (decoded.args ?? [])[i];
    });
    return { name, args, message: MESSAGES[name](args) };
  } catch {
    return null;
  }
}

/** Extract and decode a contract revert from an error object thrown by viem; returns null if it isn't a contract error. */
export function decodeContractError(error: unknown): StablecoinErrorInfo | null {
  if (!(error instanceof BaseError)) return null;
  const revertError = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revertError instanceof ContractFunctionRevertedError)) return null;
  const data = revertError.raw;
  return data ? decodeStablecoinError(data) : null;
}
