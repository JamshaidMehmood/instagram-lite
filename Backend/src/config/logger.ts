import pino from 'pino';

import { env } from './env';

/**
 * Structured logging. In development we pretty-print; in production we emit
 * newline-delimited JSON so a log aggregator can index the fields.
 *
 * `redact` is the important part: request logging middleware attaches headers
 * and bodies, and we never want an Authorization header, cookie, or password
 * landing in a log sink.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
  ...(env.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
});
