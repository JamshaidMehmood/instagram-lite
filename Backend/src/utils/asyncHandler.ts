import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not catch rejections from async handlers — an unhandled
 * rejection there leaves the request hanging until it times out. Wrapping
 * forwards the rejection to the error middleware instead.
 *
 * Kept deliberately non-generic. Parameterising it over the request generics
 * makes Express's handler-array inference fight between a generic middleware
 * (`validate`, `requireAuth`) and a narrowly-typed controller in the same
 * `router.post(...)` call. Controllers instead read validated input through
 * the typed accessors in `utils/request.ts`, which is where the zod schema
 * already guarantees the shape.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
