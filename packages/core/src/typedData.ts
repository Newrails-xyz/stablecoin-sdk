import { hashTypedData, toHex } from 'viem';
import type {
  BurnAuthorizationMessage,
  Bytes32,
  Eip712Domain,
  PermitMessage,
  TransferAuthorizationMessage,
  UnsignedTypedData,
} from './types.js';

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export const BURN_FROM_WITH_AUTHORIZATION_TYPES = {
  BurnFromWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Cryptographically random 32-byte authorization nonce. */
export function randomNonce(): Bytes32 {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function buildTransferAuthorizationTypedData(
  domain: Eip712Domain,
  message: TransferAuthorizationMessage,
): UnsignedTypedData<'TransferWithAuthorization', TransferAuthorizationMessage> {
  return {
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  };
}

export function buildReceiveAuthorizationTypedData(
  domain: Eip712Domain,
  message: TransferAuthorizationMessage,
): UnsignedTypedData<'ReceiveWithAuthorization', TransferAuthorizationMessage> {
  return {
    domain,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: 'ReceiveWithAuthorization',
    message,
  };
}

export function buildBurnAuthorizationTypedData(
  domain: Eip712Domain,
  message: BurnAuthorizationMessage,
): UnsignedTypedData<'BurnFromWithAuthorization', BurnAuthorizationMessage> {
  return {
    domain,
    types: BURN_FROM_WITH_AUTHORIZATION_TYPES,
    primaryType: 'BurnFromWithAuthorization',
    message,
  };
}

export function buildPermitTypedData(
  domain: Eip712Domain,
  message: PermitMessage,
): UnsignedTypedData<'Permit', PermitMessage> {
  return { domain, types: PERMIT_TYPES, primaryType: 'Permit', message };
}

/** Compute the EIP-712 digest of the typed data (consistent with the contract's _hashTypedDataV4). */
export function typedDataDigest(typedData: UnsignedTypedData<string, object>): Bytes32 {
  return hashTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message as Record<string, unknown>,
  });
}
