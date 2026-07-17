export type { Address, StablecoinDeployment } from './types.js';
export { STABLECOIN_ABI } from './abi.js';
export { DEPLOYMENTS } from './deployments.js';

import { DEPLOYMENTS } from './deployments.js';
import type { StablecoinDeployment } from './types.js';

/** Get the official deployment record by chainId; throws if it doesn't exist (the address can be overridden, see core's CreateClientOptions). */
export function getDeployment(chainId: number): StablecoinDeployment {
  const deployment = DEPLOYMENTS[chainId];
  if (!deployment) {
    const known = Object.keys(DEPLOYMENTS).join(', ');
    throw new Error(`no official EURW deployment for chainId ${chainId} (known: ${known})`);
  }
  return deployment;
}
