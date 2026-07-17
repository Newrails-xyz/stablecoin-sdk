import type { Address } from '@newrailsuab/stablecoin-contracts';

export type { Address };
export type Hex = `0x${string}`;
export type Bytes32 = `0x${string}`;

/** EIP-712 domain (chainId as a number, to align with viem). */
export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/** Abstraction for an account that can sign EIP-712. viem's LocalAccount structurally satisfies this interface directly. */
export interface StablecoinSigner {
  readonly address: Address;
  signTypedData(typedData: {
    domain: Eip712Domain;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: object;
  }): Promise<Hex>;
}

export interface TransferAuthorizationMessage {
  from: Address;
  to: Address;
  value: bigint;
  /** The contract uses strict comparison: block.timestamp must be > validAfter. 0 in normal scenarios. */
  validAfter: bigint;
  /** The contract uses strict comparison: block.timestamp must be < validBefore. */
  validBefore: bigint;
  /** Random 32 bytes, not sequential. */
  nonce: Bytes32;
}

export interface BurnAuthorizationMessage {
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Bytes32;
}

export interface PermitMessage {
  owner: Address;
  spender: Address;
  value: bigint;
  /** EIP-2612 sequential nonce (read on-chain). */
  nonce: bigint;
  deadline: bigint;
}

/**
 * Authorization validity. The contract has no cancelAuthorization, so a signed authorization
 * cannot be revoked before it expires; hence the default is validFor: "1h", and any longer validity must be passed explicitly.
 */
export interface AuthorizationValidity {
  /** Human-friendly form: "30s" | "10m" | "1h" | "7d". Defaults to "1h". */
  validFor?: string;
  /** Or specify an absolute Unix timestamp (in seconds) directly. */
  validAfter?: bigint;
  validBefore?: bigint;
}

export interface UnsignedTypedData<
  TPrimaryType extends string = string,
  TMessage extends object = Record<string, unknown>,
> {
  domain: Eip712Domain;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: TPrimaryType;
  message: TMessage;
}

export interface SignedAuthorization<TMessage> {
  message: TMessage;
  /** packed: r || s || v (65 bytes); an ERC-1271 wallet's may be any length. */
  signature: Hex;
  /** For troubleshooting and auditing. */
  digest: Bytes32;
}

export interface TxOverrides {
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}
