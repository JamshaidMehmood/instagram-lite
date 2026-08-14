import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { ApiError } from '../utils/ApiError';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * One message per field, keeping the *first* failure.
 *
 * A password can trip several rules at once ("too short", "needs an uppercase
 * letter", "needs a number"); surfacing the last one to fire is arbitrary,
 * while the first follows the order the rules are declared in and reads as the
 * most fundamental problem.
 */
function formatIssues(error: ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const field = issue.path.join('.') || '_';
    if (!(field in acc)) acc[field] = issue.message;
    return acc;
  }, {});
}

/**
 * Parses and *replaces* the request segments with their validated values, so
 * handlers receive coerced types (numbers from query strings, trimmed strings,
 * defaults applied) and unknown keys are stripped rather than forwarded into a
 * Mongo query.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', formatIssues(error)));
        return;
      }
      next(error);
    }
  };
}
