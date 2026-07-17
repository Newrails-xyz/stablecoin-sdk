import { keccak256, stringToHex } from 'viem';
import type { Bytes32 } from './types.js';

/** Consistent with src/libraries/Roles.sol: role id = keccak256(role name). */
export const ROLES = {
  ADMIN_ROLE: keccak256(stringToHex('ADMIN_ROLE')),
  MINTER_ROLE: keccak256(stringToHex('MINTER_ROLE')),
  MINTER_APPROVER_ROLE: keccak256(stringToHex('MINTER_APPROVER_ROLE')),
  BURNER_ROLE: keccak256(stringToHex('BURNER_ROLE')),
  PAUSER_ROLE: keccak256(stringToHex('PAUSER_ROLE')),
  BLACKLISTER_ROLE: keccak256(stringToHex('BLACKLISTER_ROLE')),
  UPGRADER_ROLE: keccak256(stringToHex('UPGRADER_ROLE')),
  RESCUER_ROLE: keccak256(stringToHex('RESCUER_ROLE')),
} as const satisfies Record<string, Bytes32>;

export type RoleName = keyof typeof ROLES;
