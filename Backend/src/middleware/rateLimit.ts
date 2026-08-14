import rateLimit, { type Options } from 'express-rate-limit';

import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Route the rejection through our error handler so the response shape stays
  // consistent with every other error the API emits.
  handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
  // Rate limiting a local dev loop just gets in the way.
  skip: () => !env.isProduction && env.NODE_ENV !== 'test',
};

/** Baseline ceiling applied to the whole API. */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
});

/**
 * Credential endpoints are the ones worth brute-forcing, so they get a much
 * tighter budget and successful requests are not counted — a legitimate user
 * signing in repeatedly is not the threat model.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  handler: (_req, _res, next) =>
    next(ApiError.tooManyRequests('Too many attempts. Try again in a few minutes.')),
});

/** Uploads are expensive in bandwidth and storage. */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 60,
});

/** Anything that creates a document. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 300,
});
