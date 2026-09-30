import { ApiError } from '../lib/ApiError.js';
import { verifySessionToken } from '../services/siwe.service.js';

/**
 * Gate for any route that needs a logged-in wallet.
 *
 * On success attaches `req.wallet = { address, chainId }` — an address the
 * server has cryptographically verified, not one the client asserted. That
 * distinction is the entire point of the login flow.
 */
export function requireWallet(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(ApiError.unauthorized('Expected an "Authorization: Bearer <token>" header'));
  }

  try {
    const claims = verifySessionToken(token);
    req.wallet = { address: claims.sub, chainId: claims.chainId };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * For routes where the body names an address to act on.
 *
 * Without this, a logged-in user could ask the server to act `from` someone
 * else's address. Comparing against the verified session address closes that.
 * This is the guard the contract endpoints will sit behind.
 */
export function requireSelf(field = 'address') {
  return (req, _res, next) => {
    const claimed = req.valid?.body?.[field] ?? req.body?.[field];
    if (!claimed) return next();
    if (claimed.toLowerCase() !== req.wallet.address.toLowerCase()) {
      return next(ApiError.forbidden(`"${field}" must match the authenticated wallet`));
    }
    next();
  };
}
