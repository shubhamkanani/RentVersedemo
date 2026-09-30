import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

import * as siwe from '../services/siwe.service.js';
import { validate } from '../middleware/validate.js';
import { requireWallet } from '../middleware/auth.js';

const router = Router();

/* ----------------------------------------------------------------- schemas -- */

const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte address');

const NonceSchema = z.object({ address: AddressSchema });

const VerifySchema = z.object({
  nonce: z.string().regex(/^[a-f0-9]{32}$/, 'malformed nonce'),
  // 65 bytes: r (32) + s (32) + v (1).
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'must be a 65-byte signature'),
});

/* -------------------------------------------------------------- rate limit -- */

// The login endpoints are the cheapest thing to spam and each nonce allocates
// server-side state, so they get a tighter budget than the global limiter.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
});

/* ------------------------------------------------------------------ routes -- */

/**
 * Step 1 — request a challenge.
 *
 * Public by definition: this is how an anonymous visitor starts logging in.
 * Returns the exact string the wallet must sign.
 */
router.post('/nonce', loginLimiter, validate({ body: NonceSchema }), (req, res) => {
  const challenge = siwe.createChallenge({ address: req.valid.body.address });
  res.status(201).json({ data: challenge });
});

/**
 * Step 2 — submit the signature.
 *
 * Note there is no `address` in the body. The address is recovered from the
 * signature itself, so the client cannot assert who it is — that is what makes
 * this authentication rather than a claim.
 */
router.post('/verify', loginLimiter, validate({ body: VerifySchema }), (req, res) => {
  const session = siwe.verifyChallenge(req.valid.body);
  res.status(200).json({ data: session });
});

/** Step 3 — who am I? Proves the token round-trips. */
router.get('/me', requireWallet, (req, res) => {
  res.status(200).json({ data: { address: req.wallet.address, chainId: req.wallet.chainId } });
});

export default router;
