import { ethers } from 'ethers';
import { getContract, getInterface, getAddress } from '../chain/contracts.js';
import { getProvider, toApiError } from '../chain/provider.js';
import { config } from '../config/index.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * Property domain service.
 *
 * The contracts expose tokens; the product talks about properties. This layer
 * owns that translation, so routes stay thin and the HTTP shape can change
 * without touching chain code (and vice versa).
 */

/** Chain reads → a stable JSON DTO. BigInt is not JSON-serialisable. */
function toPropertyDto({ tokenId, owner, tokenURI, escrow }) {
  return {
    tokenId: String(tokenId),
    owner,
    tokenURI,
    escrow: escrow && {
      listed: escrow.listed,
      buyer: escrow.buyer === ethers.ZeroAddress ? null : escrow.buyer,
      purchasePriceWei: escrow.purchasePriceWei,
      purchasePriceEth: ethers.formatEther(escrow.purchasePriceWei),
      escrowAmountWei: escrow.escrowAmountWei,
      escrowAmountEth: ethers.formatEther(escrow.escrowAmountWei),
      inspectionPassed: escrow.inspectionPassed,
    },
  };
}

async function readEscrowState(tokenId) {
  // Escrow is optional: the catalogue is still meaningful before one is
  // deployed, so a missing address degrades to `escrow: null` rather than a 503.
  if (!getAddress('escrow')) return null;

  const escrow = getContract('escrow');
  const [listed, buyer, purchasePrice, escrowAmount, inspectionPassed] = await Promise.all([
    escrow.isListed(tokenId),
    escrow.buyer(tokenId),
    escrow.purchasePrice(tokenId),
    escrow.escrowAmount(tokenId),
    escrow.inspectionPassed(tokenId),
  ]);

  return {
    listed,
    buyer,
    purchasePriceWei: purchasePrice.toString(),
    escrowAmountWei: escrowAmount.toString(),
    inspectionPassed,
  };
}

export async function getTotalSupply() {
  try {
    return Number(await getContract('realEstate').totalSupply());
  } catch (err) {
    throw toApiError(err, 'realEstate.totalSupply');
  }
}

export async function findById(tokenId) {
  const realEstate = getContract('realEstate');
  try {
    const [owner, tokenURI] = await Promise.all([
      realEstate.ownerOf(tokenId),
      realEstate.tokenURI(tokenId),
    ]);
    return toPropertyDto({ tokenId, owner, tokenURI, escrow: await readEscrowState(tokenId) });
  } catch (err) {
    // ERC-721 reverts on a nonexistent token. That is a 404, not a 400.
    if (err?.code === 'CALL_EXCEPTION' || /nonexistent|invalid token/i.test(err?.reason ?? '')) {
      throw ApiError.notFound(`No property with tokenId ${tokenId}`);
    }
    throw toApiError(err, 'realEstate.ownerOf');
  }
}

/**
 * Paginated catalogue.
 *
 * Honest about its cost: this fans out one set of RPC reads per token, so it is
 * O(n) calls per page — fine for a demo and small collections, and bounded by
 * `limit` so a large collection cannot be used to hammer the node.
 *
 * The production answer is an indexer: ingest Transfer/List events into Postgres
 * and serve reads from there, keeping this chain path for write-preparation and
 * reconciliation only. The seam is exactly this function — swap the body, leave
 * the signature alone, nothing upstream notices.
 */
export async function list({ page = 1, limit = 12 } = {}) {
  const total = await getTotalSupply();

  // tokenIds are 1-indexed: RealEstate.mint() increments before minting.
  const start = (page - 1) * limit + 1;
  const end = Math.min(start + limit - 1, total);
  const ids = start > total ? [] : Array.from({ length: end - start + 1 }, (_, i) => start + i);

  // allSettled, not all: one unreadable token must not fail the whole page.
  const settled = await Promise.allSettled(ids.map((id) => findById(id)));
  const items = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);

  for (const [i, r] of settled.entries()) {
    if (r.status === 'rejected') {
      console.warn(`[properties] skipped tokenId ${ids[i]}: ${r.reason?.message}`);
    }
  }

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: end < total,
    },
  };
}

/**
 * Build an unsigned transaction.
 *
 * The central architectural decision in this API: the server decides WHAT call
 * is legitimate and encodes it; the user's wallet decides WHETHER to sign it.
 * No private key exists server-side, so a fully compromised API cannot move
 * funds — the worst it can do is propose a transaction the user must still
 * approve in MetaMask, where the target, value and decoded call are visible.
 *
 * Every prepare* function returns this same envelope, so the client has exactly
 * one code path for "send a transaction".
 */
async function buildUnsignedTx({ contract, method, args, from, value = 0n }) {
  const to = getAddress(contract);
  const data = getInterface(contract).encodeFunctionData(method, args);
  const tx = { to, data, value: value.toString(), chainId: config.chain.id };

  // Simulate before returning. Without this the client discovers a revert only
  // after the user approved in MetaMask — a wasted signature and a bad
  // experience. eth_estimateGas both prices the call and proves it would succeed.
  try {
    const gas = await getProvider().estimateGas({ to, data, from, value });
    // 20% headroom: the estimate is exact for the simulated state, and state can
    // move between preparation and broadcast.
    tx.gasLimit = ((gas * 120n) / 100n).toString();
  } catch (err) {
    throw toApiError(err, `${contract}.${method} simulation`);
  }

  return tx;
}

/**
 * Prepare the earnest-money deposit for a listed property.
 *
 * The amount is read from the contract, never taken from the request. A
 * client-supplied value would let a caller underpay, and the revert would only
 * surface after they had already signed.
 */
export async function prepareDeposit({ tokenId, from }) {
  const property = await findById(tokenId);

  if (!property.escrow) throw ApiError.notConfigured('Escrow is not configured');
  if (!property.escrow.listed) {
    throw ApiError.conflict(`Property ${tokenId} is not listed for sale`);
  }
  if (property.escrow.buyer && property.escrow.buyer.toLowerCase() !== from.toLowerCase()) {
    throw ApiError.forbidden(`Property ${tokenId} is reserved for a different buyer`);
  }

  const value = BigInt(property.escrow.escrowAmountWei);

  return {
    intent: 'deposit_earnest',
    tokenId: String(tokenId),
    amountWei: value.toString(),
    amountEth: ethers.formatEther(value),
    transaction: await buildUnsignedTx({
      contract: 'escrow',
      method: 'depositEarnest',
      args: [tokenId],
      from,
      value,
    }),
  };
}

export async function prepareApproveSale({ tokenId, from }) {
  const property = await findById(tokenId);
  if (!property.escrow?.listed) {
    throw ApiError.conflict(`Property ${tokenId} is not listed for sale`);
  }

  return {
    intent: 'approve_sale',
    tokenId: String(tokenId),
    transaction: await buildUnsignedTx({
      contract: 'escrow',
      method: 'approveSale',
      args: [tokenId],
      from,
    }),
  };
}

/**
 * Report the status of a broadcast transaction.
 *
 * The client broadcasts, since it holds the key — this is how it reconciles.
 * Kept server-side rather than letting the browser poll the node directly: one
 * place to add caching, and the browser never needs an RPC URL.
 */
export async function getTransactionStatus(hash) {
  try {
    const receipt = await getProvider().getTransactionReceipt(hash);
    if (!receipt) return { hash, status: 'pending', confirmations: 0 };

    return {
      hash,
      status: receipt.status === 1 ? 'confirmed' : 'reverted',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      confirmations: await receipt.confirmations(),
    };
  } catch (err) {
    throw toApiError(err, 'getTransactionReceipt');
  }
}
