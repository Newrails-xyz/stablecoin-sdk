# stablecoin-sdk

TypeScript SDK monorepo for the Newrails Stablecoin, built for the [Monad](https://www.monad.xyz/) blockchain.

## Gasless on Monad

On [Monad](https://www.monad.xyz/), the real friction isn't gas price — it's that an account needs native MON before it can move at all, the biggest onboarding drop-off for a stablecoin. This SDK is built around **EIP-3009 signed authorizations**: the payer only signs, while a merchant, relayer, or facilitator submits the transaction and pays the gas.

A few things make this a natural fit for Monad specifically:

- **Ready as an x402 / MPP settlement layer.** Monad has joined the [x402 Foundation](https://blog.monad.xyz/blog/monad-foundation-joins-x402-foundation) and runs an [x402 facilitator](https://docs.monad.xyz/guides/x402) for machine/agent payments (MPP is x402-backwards-compatible). The `encodeReceiveWithAuthorization` / `encodeTransferWithAuthorization` helpers return raw calldata (no transaction sent), so a facilitator can use a signed EURW authorization as the on-chain settlement step of an x402/MPP payment. *(The SDK provides the settlement primitive; it does not bundle an x402 server.)*
- **Bring your own submission path.** Because the `encode*` helpers stop at calldata, the same signed authorization can also be routed through an ERC-4337 UserOp or an [EIP-7702](https://docs.monad.xyz/developer-essentials/eip-7702) gas-sponsored call — not just a plain relayer.

## Packages

| Package | Description | Status |
| --- | --- | --- |
| [`@newrailsuab/stablecoin-contracts`](./packages/contracts) | ABI + per-chain deployment registry | Skeleton, usable |
| [`@newrailsuab/stablecoin-core`](./packages/core) | Read/write, EIP-712 authorization signing, permit, typed errors, preflight, event subscriptions | Skeleton, usable |

## Installation

```bash
npm install @newrailsuab/stablecoin-core viem
```

`@newrailsuab/stablecoin-contracts` (ABI + address registry) is pulled in automatically; install `viem` too, since you import from it directly (e.g. `viem/accounts`).

## Usage example

```ts
import { createStablecoinClient } from '@newrailsuab/stablecoin-core';
import { privateKeyToAccount } from 'viem/accounts';

const client = createStablecoinClient({
  chainId: 10143, // Monad testnet — address/RPC resolved from the registry
  signer: privateKeyToAccount('0x...'),
});

// Verify the EIP-712 domain once at startup (guards against config drift)
await client.verifyEip712Domain();

// gasless: user signs an authorization (default 1h validity; authorizations are irrevocable)
const signed = await client.authorizations.signReceiveAuthorization({
  to: '0xMerchant...',
  value: 1_000_000n, // 1.000000 EURW
  validity: { validFor: '10m' },
});

// Merchant/relayer side: preflight, then submit (the submitter must equal `to`)
const check = await client.write.preflight({
  kind: 'receiveWithAuthorization',
  message: signed.message,
  caller: '0xMerchant...',
});
if (check.ok) {
  await client.authorizations.submitReceiveWithAuthorization(signed);
}
```

## Security notes (required reading for integrators)

- Contract integrations should default to `receiveWithAuthorization` (the submitter must equal the recipient); a `transferWithAuthorization` signature can be submitted by anyone.
- Authorizations are **irrevocable** (the contract has no `cancelAuthorization`); the SDK defaults to a 1h validity, and the UI must show the user the amount and expiry.
- Time windows use strict comparison: `block.timestamp > validAfter && < validBefore`.
- ERC-1271 is supported: contract wallets such as Safe can act as the authorizer.

## Development

Building the SDK locally and refreshing the ABI / registry / test vectors is covered in [DEVELOPMENT.md](./DEVELOPMENT.md).
