import { Router } from 'express';

import authRoutes from './auth.routes.js';
import propertyRoutes from './property.routes.js';
import { asyncHandler } from '../lib/ApiError.js';
import { probeChain } from '../chain/provider.js';
import { configuredContracts } from '../chain/contracts.js';
import * as nonceStore from '../services/nonce.store.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * Single mount point for v1.
 *
 * Versioning lives in the path rather than a header: greppable, cacheable, and
 * v2 can run alongside v1 during a migration without content negotiation.
 */

/**
 * Returns 200 even when the chain is unreachable, with status "degraded".
 *
 * The API process is healthy; a downstream node being down is not a reason for
 * an orchestrator to restart it. A 503 here would cause a restart loop that
 * fixes nothing — the node would still be down.
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const chain = await probeChain();
    res.status(200).json({
      status: chain.reachable ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      auth: {
        siweDomain: config.siwe.domain,
        pendingChallenges: nonceStore.size(),
      },
      chain: { expectedChainId: config.chain.id, rpcUrl: config.chain.rpcUrl, ...chain },
      contracts: configuredContracts(),
    });
  })
);

router.use('/auth', authRoutes);
router.use('/', propertyRoutes);

export default router;
