/**
 * The only error type handlers throw deliberately.
 *
 * Everything reaching the error middleware is either an ApiError (a fault we
 * described, safe to return verbatim) or an unknown Error (a bug, reported as an
 * opaque 500). That split is what keeps internal detail out of responses.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Not permitted') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  /** Request is well-formed, but the current on-chain state forbids it. */
  static conflict(message, details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  /** A contract address is missing — a deployment gap, not a user error. */
  static notConfigured(message) {
    return new ApiError(503, 'NOT_CONFIGURED', message);
  }

  /** The chain could not serve or accept the call. */
  static chain(message, details) {
    return new ApiError(502, 'CHAIN_ERROR', message, details);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

/** Forwards async rejections to Express's error pipeline. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
