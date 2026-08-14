/**
 * An error the API deliberately produced and can safely describe to the client.
 *
 * The error middleware uses `isOperational` to decide what leaks: operational
 * errors surface their message, anything else becomes a generic 500 so stack
 * traces and driver internals never reach a caller.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;
  readonly isOperational = true;

  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(message: string, code = 'CONFLICT'): ApiError {
    return new ApiError(409, message, code);
  }

  static payloadTooLarge(message: string): ApiError {
    return new ApiError(413, message, 'PAYLOAD_TOO_LARGE');
  }

  static unsupportedMediaType(message: string): ApiError {
    return new ApiError(415, message, 'UNSUPPORTED_MEDIA_TYPE');
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): ApiError {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS');
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }

  /** A feature the build supports but this deployment is not configured for. */
  static serviceUnavailable(message: string): ApiError {
    return new ApiError(503, message, 'SERVICE_UNAVAILABLE');
  }
}
