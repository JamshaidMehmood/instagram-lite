import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Cannot ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};

/** Extracts the offending field from a duplicate-key error. */
function duplicateKeyField(error: MongoServerError): string {
  const key = error.keyPattern ? Object.keys(error.keyPattern)[0] : undefined;
  return key ?? 'field';
}

/**
 * Translates every error the stack can produce into one response shape:
 * `{ error: { code, message, details? } }`.
 *
 * Anything not explicitly recognised is treated as a bug: it is logged in full
 * and answered with a generic 500, so internal details never reach a client.
 */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    const details = error.issues.reduce<Record<string, string>>((acc, issue) => {
      const field = issue.path.join('.') || '_';
      if (!(field in acc)) acc[field] = issue.message;
      return acc;
    }, {});
    return ApiError.badRequest('Validation failed', details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for '${error.path}'`);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.entries(error.errors).reduce<Record<string, string>>(
      (acc, [path, issue]) => {
        acc[path] = issue.message;
        return acc;
      },
      {},
    );
    return ApiError.badRequest('Validation failed', details);
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    const field = duplicateKeyField(error);
    return ApiError.conflict(`That ${field} is already taken`, 'DUPLICATE_KEY');
  }

  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const limitMb = (env.MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
      return ApiError.payloadTooLarge(`File is too large. Maximum size is ${limitMb} MB`);
    }
    return ApiError.badRequest(`Upload rejected: ${error.message}`);
  }

  if (error instanceof Error) {
    if (error.name === 'TokenExpiredError') {
      return new ApiError(401, 'Access token has expired', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') {
      return new ApiError(401, 'Invalid access token', 'TOKEN_INVALID');
    }
  }

  return ApiError.internal();
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const apiError = toApiError(error);

  const log = {
    err: error,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    statusCode: apiError.statusCode,
  };

  // 5xx means we did something wrong; 4xx means the caller did. Only the
  // former is worth waking someone up for.
  if (apiError.statusCode >= 500) {
    logger.error(log, 'Unhandled error');
  } else {
    logger.warn(log, apiError.message);
  }

  res.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(env.isProduction || !(error instanceof Error) ? {} : { stack: error.stack }),
    },
  });
};
