import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // Behind Vercel/nginx the socket address is the proxy's. Without this,
  // `req.ip` is the proxy for every caller and the rate limiter would bucket
  // the entire internet together.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  /**
   * An allowlist, not `*`. Credentialed requests (the refresh cookie) are only
   * permitted from known origins, and the browser refuses `*` alongside
   * `credentials: true` anyway. The previous `app.use(cors())` accepted every
   * origin on the internet.
   */
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers (curl, health checks) send no
        // Origin header at all.
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // In development, accept any localhost / 127.0.0.1 port. Create React
        // App silently moves to 3001, 3002, … when its default port is taken,
        // and a hard-coded single origin would then reject the dev frontend.
        if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          callback(null, true);
          return;
        }
        // A disallowed origin is answered without CORS headers (the browser
        // blocks it) rather than thrown — throwing turned a rejected preflight
        // into a noisy 500 in the logs.
        callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    }),
  );

  app.use(compression());

  /**
   * 100 KB, down from the old 10 MB.
   *
   * Images no longer travel as base64 inside JSON — they are multipart, where
   * multer enforces its own limit while streaming. The largest legitimate JSON
   * body is now a 2200-character caption, so a big ceiling only buys an
   * attacker cheap memory pressure.
   */
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  // Strips `$`-prefixed and dotted keys so a body like `{"email": {"$ne": null}}`
  // cannot reshape a query into an operator.
  app.use(mongoSanitize({ replaceWith: '_' }));

  app.use(
    pinoHttp({
      logger,
      // Health checks would otherwise dominate the log volume.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.use(globalLimiter);

  app.get('/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      uptime: Math.round(process.uptime()),
    });
  });

  app.use('/api/v1', apiRouter);

  // Order matters: unmatched routes become a 404 error, and the error handler
  // is last so it sees everything above it.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
