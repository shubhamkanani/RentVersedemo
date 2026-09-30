import { Router } from 'express';
import { z } from 'zod';

import * as propertyService from '../services/property.service.js';
import { validate } from '../middleware/validate.js';
import { requireWallet, requireSelf } from '../middleware/auth.js';
import { asyncHandler } from '../lib/ApiError.js';

const router = Router();

/* ----------------------------------------------------------------- schemas -- */

const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte address');

const TokenIdParams = z.object({
  tokenId: z.coerce.number().int('tokenId must be an integer').positive('tokenId is 1-indexed'),
});

const TxHashParams = z.object({
  hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 32-byte transaction hash'),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Capped deliberately: the catalogue read fans out one set of RPC calls per
  // token, so an unbounded limit would let one request stampede the node.
  limit: z.coerce.number().int().positive().max(50).default(12),
});

const PrepareBody = z.object({ from: AddressSchema });

/* ------------------------------------------------------------------- reads -- */

/**
 * Public on purpose. The underlying chain data is public anyway, so requiring a
 * login to browse the catalogue would be security theatre — and it would stop
 * the landing page rendering for a first-time visitor.
 */
router.get(
  '/properties',
  validate({ query: PaginationQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.valid.query;
    const { items, pagination } = await propertyService.list({ page, limit });
    res.status(200).json({ data: items, pagination });
  })
);

router.get(
  '/properties/:tokenId',
  validate({ params: TokenIdParams }),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await propertyService.findById(req.valid.params.tokenId) });
  })
);

/* -------------------------------------------- transaction preparation -- */

/**
 * These return UNSIGNED transactions — the server encodes the call, the user's
 * wallet signs and broadcasts it.
 *
 * Authenticated for two reasons: gas estimation is a full simulation and costs
 * RPC, and `from` must be provably the caller's own address. requireSelf is what
 * enforces the second — without it a logged-in user could ask the server to
 * build a transaction from someone else's address.
 */
router.post(
  '/properties/:tokenId/deposit/prepare',
  requireWallet,
  validate({ params: TokenIdParams, body: PrepareBody }),
  requireSelf('from'),
  asyncHandler(async (req, res) => {
    const result = await propertyService.prepareDeposit({
      tokenId: req.valid.params.tokenId,
      from: req.valid.body.from,
    });
    res.status(200).json({ data: result });
  })
);

router.post(
  '/properties/:tokenId/approve-sale/prepare',
  requireWallet,
  validate({ params: TokenIdParams, body: PrepareBody }),
  requireSelf('from'),
  asyncHandler(async (req, res) => {
    const result = await propertyService.prepareApproveSale({
      tokenId: req.valid.params.tokenId,
      from: req.valid.body.from,
    });
    res.status(200).json({ data: result });
  })
);

/* ------------------------------------------------------------ reconcile -- */

/**
 * The client broadcasts (it holds the key), so this is how it follows up.
 * Server-side rather than letting the browser poll the node: one place to add
 * caching, and the browser never needs an RPC URL.
 */
router.get(
  '/transactions/:hash',
  validate({ params: TxHashParams }),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await propertyService.getTransactionStatus(req.valid.params.hash) });
  })
);

export default router;
