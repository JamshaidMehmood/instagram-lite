import type { Server } from 'node:http';

import { createApp } from './app';
import { connectToDatabase, disconnectFromDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

async function bootstrap(): Promise<void> {
  // Connect before listening: accepting traffic we cannot serve just produces
  // a burst of 500s during startup.
  await connectToDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  registerShutdownHandlers(server);
}

/**
 * Drains in-flight requests before exiting.
 *
 * On deploy the platform sends SIGTERM and then kills the process; without
 * this, every request in flight is severed mid-response. The timer is the
 * backstop for a connection that refuses to close.
 */
function registerShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    void (async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received, shutting down`);

      const forceExit = setTimeout(() => {
        logger.error('Shutdown timed out, forcing exit');
        process.exit(1);
      }, 10_000);
      forceExit.unref();

      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await disconnectFromDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // A process that has hit one of these is in an unknown state. Log the cause,
  // then let the shutdown path close things cleanly rather than limping on.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
