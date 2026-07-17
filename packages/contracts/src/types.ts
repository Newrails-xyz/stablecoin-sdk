export type Address = `0x${string}`;

/** One official deployment record. Source: packages/contracts/src/deployments.ts (governed by PR + CI on-chain verification). */
export interface StablecoinDeployment {
  chainId: number;
  chainName: string;
  /** CreateX deterministic deployment; the goal is the same address on all EVM chains. */
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  /** EIP-712 domain parameters; at runtime these should be cross-checked via ERC-5267 eip712Domain(). */
  eip712: { name: string; version: string };
  /** Built-in public RPC, can be overridden by the caller. */
  rpcUrl: string;
  /** The block the deployment is at; the starting point for event scans. */
  deployBlock: bigint;
}
