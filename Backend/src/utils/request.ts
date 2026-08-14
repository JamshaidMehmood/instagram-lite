import type { Request } from 'express';

import { ApiError } from './ApiError';
import type { AuthUser } from '../modules/auth/auth.types';

/**
 * Typed views over a request that `validate(...)` has already parsed.
 *
 * The assertion is sound because these are only ever called on routes whose
 * schema produced exactly this type; the cast documents that contract in one
 * place instead of scattering `as` through the controllers.
 */
export function validatedBody<T>(req: Request): T {
  return req.body as T;
}

export function validatedQuery<T>(req: Request): T {
  return req.query as unknown as T;
}

export function validatedParams<T>(req: Request): T {
  return req.params as unknown as T;
}

/**
 * Reads the authenticated caller, narrowing away the optional.
 *
 * Routes behind `requireAuth` always have `req.user`, but the type is optional
 * because `optionalAuth` shares the field. Throwing here means a route
 * accidentally mounted without `requireAuth` fails closed with a 401 rather
 * than dereferencing undefined.
 */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
