import { ApiError } from '../lib/ApiError.js';
import { config } from '../config/index.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/**
 * The single place any error becomes an HTTP response.
 *
 * Two classes, handled differently on purpose:
 *   ApiError      a fault we described; the message is safe to return verbatim
 *   anything else a bug; log it fully, return an opaque 500
 *
 * That asymmetry matters. Returning err.message for unexpected errors is how
 * file paths, secrets and internal hostnames end up in client responses.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4).
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError || err?.expected) {
    return res.status(err.status).json(err.toJSON());
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(config.isProd ? {} : { debug: err?.message }),
    },
  });
}
