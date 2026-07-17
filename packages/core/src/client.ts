import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseSignature,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import {
  DEPLOYMENTS,
  STABLECOIN_ABI,
  type StablecoinDeployment,
} from '@newrailsuab/stablecoin-contracts';

import {
  buildBurnAuthorizationTypedData,
  buildPermitTypedData,
  buildReceiveAuthorizationTypedData,
  buildTransferAuthorizationTypedData,
  randomNonce,
  typedDataDigest,
} from './typedData.js';
import { resolveValidity } from './validity.js';
import { preflight, type PreflightAction, type PreflightResult } from './preflight.js';
import type {
  Address,
  AuthorizationValidity,
  BurnAuthorizationMessage,
  Bytes32,
  Eip712Domain,
  Hex,
  PermitMessage,
  SignedAuthorization,
  StablecoinSigner,
  TransferAuthorizationMessage,
  TxOverrides,
  UnsignedTypedData,
} from './types.js';

export interface CreateClientOptions {
  chainId: number;
  /** Defaults to the registry's built-in RPC; required when the registry doesn't have this chain. */
  rpcUrl?: string;
  /** Override the registry address (for local anvil / fork testing). */
  address?: Address;
  /** Required when the registry doesn't have this chain; you're advised to then call client.verifyEip712Domain() to cross-check against on-chain. */
  eip712?: { name: string; version: string };
  /** Used for signing authorizations / sending transactions. viem's LocalAccount satisfies both; can be omitted for read-only scenarios. */
  signer?: StablecoinSigner;
}

export interface StablecoinReader {
  balanceOf(account: Address): Promise<bigint>;
  allowance(owner: Address, spender: Address): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  paused(): Promise<boolean>;
  isBlacklisted(account: Address): Promise<boolean>;
  minterAllowance(minter: Address): Promise<bigint>;
  authorizationState(authorizer: Address, nonce: Bytes32): Promise<boolean>;
  hasRole(role: Bytes32, account: Address): Promise<boolean>;
  /** EIP-2612 permit's sequential nonce. */
  permitNonce(owner: Address): Promise<bigint>;
  /** ERC-5267. */
  eip712Domain(): Promise<Eip712Domain>;
}

export interface StablecoinWriter {
  transfer(to: Address, value: bigint, overrides?: TxOverrides): Promise<Hex>;
  approve(spender: Address, value: bigint, overrides?: TxOverrides): Promise<Hex>;
  preflight(action: PreflightAction): Promise<PreflightResult>;
}

export interface AuthorizationParams {
  /** Defaults to signer.address. */
  from?: Address;
  to: Address;
  value: bigint;
  validity?: AuthorizationValidity;
  /** Defaults to cryptographically random 32 bytes. */
  nonce?: Bytes32;
}

export interface BurnAuthorizationParams {
  from?: Address;
  value: bigint;
  validity?: AuthorizationValidity;
  nonce?: Bytes32;
}

export interface AuthorizationModule {
  readonly domain: Eip712Domain;
  randomNonce(): Bytes32;

  buildTransferAuthorization(params: AuthorizationParams & { from: Address }): UnsignedTypedData<'TransferWithAuthorization', TransferAuthorizationMessage>;
  buildReceiveAuthorization(params: AuthorizationParams & { from: Address }): UnsignedTypedData<'ReceiveWithAuthorization', TransferAuthorizationMessage>;
  buildBurnAuthorization(params: BurnAuthorizationParams & { from: Address }): UnsignedTypedData<'BurnFromWithAuthorization', BurnAuthorizationMessage>;

  signTransferAuthorization(params: AuthorizationParams, signer?: StablecoinSigner): Promise<SignedAuthorization<TransferAuthorizationMessage>>;
  signReceiveAuthorization(params: AuthorizationParams, signer?: StablecoinSigner): Promise<SignedAuthorization<TransferAuthorizationMessage>>;
  signBurnAuthorization(params: BurnAuthorizationParams, signer?: StablecoinSigner): Promise<SignedAuthorization<BurnAuthorizationMessage>>;

  /** EIP-2612 permit; nonce is read from on-chain by default. */
  signPermit(
    params: { owner?: Address; spender: Address; value: bigint; deadline: bigint; nonce?: bigint },
    signer?: StablecoinSigner,
  ): Promise<SignedAuthorization<PermitMessage>>;

  /** Only encode calldata, without sending a transaction — for integrators building their own relayer / multicall / 4337 UserOp. */
  encodeTransferWithAuthorization(signed: SignedAuthorization<TransferAuthorizationMessage>): Hex;
  encodeReceiveWithAuthorization(signed: SignedAuthorization<TransferAuthorizationMessage>): Hex;
  encodeBurnFromWithAuthorization(signed: SignedAuthorization<BurnAuthorizationMessage>): Hex;

  /** Submit on-chain using client.signer as the submitter (the submitter pays gas). */
  submitTransferWithAuthorization(signed: SignedAuthorization<TransferAuthorizationMessage>, overrides?: TxOverrides): Promise<Hex>;
  submitReceiveWithAuthorization(signed: SignedAuthorization<TransferAuthorizationMessage>, overrides?: TxOverrides): Promise<Hex>;
  submitPermit(signed: SignedAuthorization<PermitMessage>, overrides?: TxOverrides): Promise<Hex>;
}

export interface TransferEvent { from: Address; to: Address; value: bigint; txHash: Hex; blockNumber: bigint }
export interface AuthorizationUsedEvent { authorizer: Address; nonce: Bytes32; txHash: Hex; blockNumber: bigint }
export interface BlacklistStatusEvent { account: Address; blacklisted: boolean; txHash: Hex; blockNumber: bigint }

export interface EventModule {
  watchTransfers(handler: (e: TransferEvent) => void, filter?: { from?: Address; to?: Address }): () => void;
  watchAuthorizationUsed(handler: (e: AuthorizationUsedEvent) => void, filter?: { authorizer?: Address }): () => void;
  watchBlacklistStatus(handler: (e: BlacklistStatusEvent) => void): () => void;
  getTransferLogs(range: { fromBlock: bigint; toBlock?: bigint; from?: Address; to?: Address }): Promise<TransferEvent[]>;
}

export interface StablecoinClient {
  readonly deployment: StablecoinDeployment;
  readonly publicClient: PublicClient;
  readonly read: StablecoinReader;
  readonly write: StablecoinWriter;
  readonly authorizations: AuthorizationModule;
  readonly events: EventModule;
  /** Read the on-chain ERC-5267 domain and compare it against the local config, throwing on mismatch. Integrators are advised to call this once at startup. */
  verifyEip712Domain(): Promise<void>;
}

export function createStablecoinClient(options: CreateClientOptions): StablecoinClient {
  const base = DEPLOYMENTS[options.chainId];
  const address = options.address ?? base?.address;
  const rpcUrl = options.rpcUrl ?? base?.rpcUrl;
  const eip712 = options.eip712 ?? base?.eip712;
  if (!address || !rpcUrl || !eip712) {
    throw new Error(
      `chainId ${options.chainId} is not in the deployment registry; provide address, rpcUrl and eip712 explicitly`,
    );
  }

  // In override scenarios (local anvil / fork) the on-chain metadata is authoritative; the registry fields are only a display fallback.
  const deployment: StablecoinDeployment = {
    chainId: options.chainId,
    chainName: base?.chainName ?? `chain-${options.chainId}`,
    address,
    name: base?.name ?? eip712.name,
    symbol: base?.symbol ?? 'EURW',
    decimals: base?.decimals ?? 6,
    eip712,
    rpcUrl,
    deployBlock: base?.deployBlock ?? 0n,
  };

  const chain: Chain = defineChain({
    id: options.chainId,
    name: deployment.chainName,
    nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });

  const isViemAccount = (s: StablecoinSigner | undefined): s is StablecoinSigner & Account =>
    !!s && typeof s === 'object' && 'type' in s;
  const walletClient: WalletClient<ReturnType<typeof http>, Chain, Account> | undefined =
    isViemAccount(options.signer)
      ? createWalletClient({ account: options.signer, chain, transport })
      : undefined;

  const requireWallet = () => {
    if (!walletClient) {
      throw new Error('this operation sends a transaction: pass a viem LocalAccount as options.signer');
    }
    return walletClient;
  };

  const requireSigner = (signer?: StablecoinSigner) => {
    const s = signer ?? options.signer;
    if (!s) throw new Error('no signer: pass one to this call or set options.signer');
    return s;
  };

  const contract = { address, abi: STABLECOIN_ABI } as const;

  const read: StablecoinReader = {
    balanceOf: (account) => publicClient.readContract({ ...contract, functionName: 'balanceOf', args: [account] }),
    allowance: (owner, spender) =>
      publicClient.readContract({ ...contract, functionName: 'allowance', args: [owner, spender] }),
    totalSupply: () => publicClient.readContract({ ...contract, functionName: 'totalSupply' }),
    paused: () => publicClient.readContract({ ...contract, functionName: 'paused' }),
    isBlacklisted: (account) =>
      publicClient.readContract({ ...contract, functionName: 'isBlacklisted', args: [account] }),
    minterAllowance: (minter) =>
      publicClient.readContract({ ...contract, functionName: 'minterAllowance', args: [minter] }),
    authorizationState: (authorizer, nonce) =>
      publicClient.readContract({ ...contract, functionName: 'authorizationState', args: [authorizer, nonce] }),
    hasRole: (role, account) =>
      publicClient.readContract({ ...contract, functionName: 'hasRole', args: [role, account] }),
    permitNonce: (owner) => publicClient.readContract({ ...contract, functionName: 'nonces', args: [owner] }),
    eip712Domain: async () => {
      const [, name, version, chainId, verifyingContract] = await publicClient.readContract({
        ...contract,
        functionName: 'eip712Domain',
      });
      return { name, version, chainId: Number(chainId), verifyingContract };
    },
  };

  const domain: Eip712Domain = {
    name: eip712.name,
    version: eip712.version,
    chainId: options.chainId,
    verifyingContract: address,
  };

  const resolveTransferMessage = (
    params: AuthorizationParams & { from: Address },
  ): TransferAuthorizationMessage => {
    const { validAfter, validBefore } = resolveValidity(params.validity);
    return {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter,
      validBefore,
      nonce: params.nonce ?? randomNonce(),
    };
  };

  const signTypedData = async <T extends object>(
    typedData: UnsignedTypedData<string, T>,
    signer?: StablecoinSigner,
  ): Promise<SignedAuthorization<T>> => {
    const signature = await requireSigner(signer).signTypedData(typedData);
    return { message: typedData.message, signature, digest: typedDataDigest(typedData) };
  };

  const authorizations: AuthorizationModule = {
    domain,
    randomNonce,

    buildTransferAuthorization: (params) => buildTransferAuthorizationTypedData(domain, resolveTransferMessage(params)),
    buildReceiveAuthorization: (params) => buildReceiveAuthorizationTypedData(domain, resolveTransferMessage(params)),
    buildBurnAuthorization: (params) => {
      const { validAfter, validBefore } = resolveValidity(params.validity);
      return buildBurnAuthorizationTypedData(domain, {
        from: params.from,
        value: params.value,
        validAfter,
        validBefore,
        nonce: params.nonce ?? randomNonce(),
      });
    },

    signTransferAuthorization: (params, signer) =>
      signTypedData(
        authorizations.buildTransferAuthorization({ ...params, from: params.from ?? requireSigner(signer).address }),
        signer,
      ),
    signReceiveAuthorization: (params, signer) =>
      signTypedData(
        authorizations.buildReceiveAuthorization({ ...params, from: params.from ?? requireSigner(signer).address }),
        signer,
      ),
    signBurnAuthorization: (params, signer) =>
      signTypedData(
        authorizations.buildBurnAuthorization({ ...params, from: params.from ?? requireSigner(signer).address }),
        signer,
      ),

    signPermit: async (params, signer) => {
      const owner = params.owner ?? requireSigner(signer).address;
      const nonce = params.nonce ?? (await read.permitNonce(owner));
      const typed = buildPermitTypedData(domain, {
        owner,
        spender: params.spender,
        value: params.value,
        nonce,
        deadline: params.deadline,
      });
      return signTypedData(typed, signer);
    },

    encodeTransferWithAuthorization: ({ message: m, signature }) =>
      encodeFunctionData({
        abi: STABLECOIN_ABI,
        functionName: 'transferWithAuthorization',
        args: [m.from, m.to, m.value, m.validAfter, m.validBefore, m.nonce, signature],
      }),
    encodeReceiveWithAuthorization: ({ message: m, signature }) =>
      encodeFunctionData({
        abi: STABLECOIN_ABI,
        functionName: 'receiveWithAuthorization',
        args: [m.from, m.to, m.value, m.validAfter, m.validBefore, m.nonce, signature],
      }),
    encodeBurnFromWithAuthorization: ({ message: m, signature }) =>
      encodeFunctionData({
        abi: STABLECOIN_ABI,
        functionName: 'burnFromWithAuthorization',
        args: [m.from, m.value, m.validAfter, m.validBefore, m.nonce, signature],
      }),

    submitTransferWithAuthorization: ({ message: m, signature }, overrides) =>
      requireWallet().writeContract({
        ...contract,
        functionName: 'transferWithAuthorization',
        args: [m.from, m.to, m.value, m.validAfter, m.validBefore, m.nonce, signature],
        ...overrides,
      }),
    submitReceiveWithAuthorization: ({ message: m, signature }, overrides) =>
      requireWallet().writeContract({
        ...contract,
        functionName: 'receiveWithAuthorization',
        args: [m.from, m.to, m.value, m.validAfter, m.validBefore, m.nonce, signature],
        ...overrides,
      }),
    submitPermit: ({ message: m, signature }, overrides) => {
      const { r, s, v, yParity } = parseSignature(signature);
      const vNormalized = v ?? BigInt((yParity ?? 0) + 27);
      return requireWallet().writeContract({
        ...contract,
        functionName: 'permit',
        args: [m.owner, m.spender, m.value, m.deadline, Number(vNormalized), r, s],
        ...overrides,
      });
    },
  };

  const write: StablecoinWriter = {
    transfer: (to, value, overrides) =>
      requireWallet().writeContract({ ...contract, functionName: 'transfer', args: [to, value], ...overrides }),
    approve: (spender, value, overrides) =>
      requireWallet().writeContract({ ...contract, functionName: 'approve', args: [spender, value], ...overrides }),
    preflight: (action) => preflight(read, action),
  };

  const events: EventModule = {
    watchTransfers: (handler, filter) =>
      publicClient.watchContractEvent({
        ...contract,
        eventName: 'Transfer',
        args: filter,
        onLogs: (logs) => {
          for (const log of logs) {
            handler({
              from: log.args.from!,
              to: log.args.to!,
              value: log.args.value!,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            });
          }
        },
      }),
    watchAuthorizationUsed: (handler, filter) =>
      publicClient.watchContractEvent({
        ...contract,
        eventName: 'AuthorizationUsed',
        args: filter,
        onLogs: (logs) => {
          for (const log of logs) {
            handler({
              authorizer: log.args.authorizer!,
              nonce: log.args.nonce!,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            });
          }
        },
      }),
    watchBlacklistStatus: (handler) =>
      publicClient.watchContractEvent({
        ...contract,
        eventName: 'BlacklistStatusChanged',
        onLogs: (logs) => {
          for (const log of logs) {
            handler({
              account: log.args.account!,
              blacklisted: log.args.blacklisted!,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            });
          }
        },
      }),
    getTransferLogs: async ({ fromBlock, toBlock, from, to }) => {
      const logs = await publicClient.getContractEvents({
        ...contract,
        eventName: 'Transfer',
        args: { from, to },
        fromBlock,
        toBlock,
      });
      return logs.map((log) => ({
        from: log.args.from!,
        to: log.args.to!,
        value: log.args.value!,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      }));
    },
  };

  return {
    deployment,
    publicClient,
    read,
    write,
    authorizations,
    events,
    verifyEip712Domain: async () => {
      const onchain = await read.eip712Domain();
      const mismatches: string[] = [];
      if (onchain.name !== domain.name) mismatches.push(`name: local "${domain.name}" vs onchain "${onchain.name}"`);
      if (onchain.version !== domain.version)
        mismatches.push(`version: local "${domain.version}" vs onchain "${onchain.version}"`);
      if (onchain.chainId !== domain.chainId)
        mismatches.push(`chainId: local ${domain.chainId} vs onchain ${onchain.chainId}`);
      if (onchain.verifyingContract.toLowerCase() !== domain.verifyingContract.toLowerCase())
        mismatches.push(
          `verifyingContract: local ${domain.verifyingContract} vs onchain ${onchain.verifyingContract}`,
        );
      if (mismatches.length > 0) {
        throw new Error(`EIP-712 domain mismatch — signatures would be invalid:\n${mismatches.join('\n')}`);
      }
    },
  };
}
