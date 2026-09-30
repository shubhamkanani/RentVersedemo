import { ethers } from 'ethers';
import { config } from '../config/index.js';
import { getProvider } from './provider.js';
import { ApiError } from '../lib/ApiError.js';
import { REAL_ESTATE_ABI, ESCROW_ABI } from './abis.js';

/**
 * Contract registry.
 *
 * Services ask for a contract by name and get a read-only, lazily-built,
 * memoised instance. Supporting a second chain later means keying this cache by
 * (name, chainId) — and nothing above this layer changes. That is precisely why
 * services never call `new ethers.Contract` themselves.
 */
const DEFINITIONS = {
  realEstate: {
    abi: REAL_ESTATE_ABI,
    envVar: 'REAL_ESTATE_ADDRESS',
    address: () => config.contracts.realEstate,
  },
  escrow: {
    abi: ESCROW_ABI,
    envVar: 'ESCROW_ADDRESS',
    address: () => config.contracts.escrow,
  },
};

const cache = new Map();

export function getContract(name) {
  const def = DEFINITIONS[name];
  if (!def) throw new Error(`Unknown contract "${name}"`);

  const address = def.address();
  if (!address) {
    throw ApiError.notConfigured(
      `Contract "${name}" has no address. Run the deploy script and set ${def.envVar} in logindemoserver/.env`
    );
  }

  if (!cache.has(name)) {
    cache.set(name, new ethers.Contract(address, def.abi, getProvider()));
  }
  return cache.get(name);
}

/**
 * An Interface — no provider, no address — purely for encoding calldata.
 *
 * This is what makes the write path non-custodial. The server encodes the
 * function call so the client cannot choose the selector or the arguments, but
 * the server holds no signer, so only the user's wallet can broadcast it.
 */
export function getInterface(name) {
  const def = DEFINITIONS[name];
  if (!def) throw new Error(`Unknown contract "${name}"`);
  return new ethers.Interface(def.abi);
}

export function getAddress(name) {
  return DEFINITIONS[name]?.address() ?? null;
}

export function configuredContracts() {
  return Object.fromEntries(
    Object.keys(DEFINITIONS).map((n) => [n, DEFINITIONS[n].address() ?? null])
  );
}
