import type { StablecoinDeployment } from './types.js';

export const DEPLOYMENTS: Record<number, StablecoinDeployment> = {
  143: {
    chainId: 143,
    chainName: "Monad Mainnet",
    address: "0x1111B3DED9F1fE1801AD4ebeF8E2788183a24111",
    name: "Newrails Euro",
    symbol: "EURW",
    decimals: 6,
    eip712: { name: "Newrails Euro", version: "1" },
    rpcUrl: "https://rpc.monad.xyz",
    deployBlock: 61584206n,
  },
  10143: {
    chainId: 10143,
    chainName: "Monad Testnet",
    address: "0x1111B3DED9F1fE1801AD4ebeF8E2788183a24111",
    name: "Newrails Euro",
    symbol: "EURW",
    decimals: 6,
    eip712: { name: "Newrails Euro", version: "1" },
    rpcUrl: "https://testnet-rpc.monad.xyz",
    deployBlock: 18952261n,
  },
};
