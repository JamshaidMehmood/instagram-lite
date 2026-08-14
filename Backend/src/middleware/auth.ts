import type { Request, RequestHandler } from 'express';

import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;

  return token;
}

/**
 * Gate for every endpoint that acts on behalf of a user.
 *
 * The whole point is that `req.user` is derived from a signed token. The old
 * API read `userId` and `email` out of the request body, which meant any
 * caller could delete another user's post or like as somebody else simply by
 * changing a JSON field.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    next(ApiError.unauthorized('Missing authentication token'));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Identifies the caller when a token is present but does not demand one.
 *
 * Used by read endpoints that personalise their response — the feed reports
 * `viewerHasLiked` for a signed-in caller and plain data for a guest.
 *
 * "Optional" means the *absence* of a token is fine, not that a broken one is.
 * An expired token used to be swallowed here so a stale session degraded to
 * the guest view instead of erroring the page. That stopped being a
 * degradation the moment the home feed became "people you follow" rather than
 * everything: falling through to the anonymous branch does not return less of
 * the answer, it returns a *different* answer — strangers' posts spliced into
 * a feed that is supposed to be the accounts you follow, every heart unfilled.
 * And because it comes back 200, the client never learns anything is wrong, so
 * it keeps serving that feed until the user happens to write something.
 *
 * Rejecting instead hands the SPA the 401 its refresh-and-retry path is
 * already built around, so the session heals on the next read rather than
 * rotting until the access token would have expired anyway.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
