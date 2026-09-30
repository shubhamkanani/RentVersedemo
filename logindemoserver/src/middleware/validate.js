import { ApiError } from '../lib/ApiError.js';

/**
 * Validate and coerce request input against a zod schema.
 *
 * Handlers downstream treat `req.valid` as trusted. Nothing reads raw req.body
 * past this point, which is what stops an unvalidated string reaching ethers —
 * where a bad address becomes an opaque INVALID_ARGUMENT instead of a clear 400.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid ??= {};

    for (const source of ['body', 'params', 'query']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (!result.success) {
        return next(
          ApiError.badRequest(`Invalid request ${source}`, {
            issues: result.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          })
        );
      }
      req.valid[source] = result.data;
    }

    next();
  };
}
