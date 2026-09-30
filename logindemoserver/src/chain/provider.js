import { ethers } from 'ethers';
import { config } from '../config/index.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * One JSON-RPC provider for the process.
 *
 * `staticNetwork` matters: without it ethers re-resolves the chain id on every
 * call, which doubles RPC traffic and turns a briefly-unreachable node into a
 * confusing "network changed" error instead of a plain connection failure.
 */
let provider;

export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.chain.rpcUrl, config.chain.id, {
      staticNetwork: ethers.Network.from(config.chain.id),
    });
  }
  return provider;
}

/**
 * The single boundary where chain-shaped failures become HTTP-shaped ones.
 *
 * Callers upstream never need to know what an ethers error looks like — and,
 * just as importantly, raw RPC errors (which can carry the node URL and internal
 * addresses) never reach a client.
 */
export function toApiError(err, context) {
  // A require()/revert that carried a reason string.
  if (err?.reason) {
    return ApiError.badRequest(`Contract rejected the call: ${err.reason}`, { context });
  }
  if (err?.code === 'CALL_EXCEPTION') {
    return ApiError.badRequest('Contract call reverted', { context, data: err.data ?? null });
  }
  if (err?.code === 'ECONNREFUSED' || err?.code === 'NETWORK_ERROR') {
    return ApiError.chain(
      `Cannot reach the node at ${config.chain.rpcUrl}. Is it running? (cd blockchain && npm run node)`,
      { context }
    );
  }
  if (err?.code === 'INVALID_ARGUMENT') {
    return ApiError.badRequest(`Invalid argument for ${context}`, { argument: err.argument });
  }

  console.error(`[chain] unmapped error in ${context}:`, err);
  return new ApiError(502, 'CHAIN_ERROR', 'Unexpected chain error', { context });
}

/** Cheap liveness probe for /health. Never throws. */
export async function probeChain() {
  try {
    const p = getProvider();
    const [blockNumber, network] = await Promise.all([p.getBlockNumber(), p.getNetwork()]);
    return { reachable: true, blockNumber, chainId: Number(network.chainId) };
  } catch (err) {
    return { reachable: false, reason: err?.shortMessage ?? err?.code ?? 'unknown' };
  }
}
