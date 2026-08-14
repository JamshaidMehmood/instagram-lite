import mongoose from 'mongoose';

import { env } from './env';
import { logger } from './logger';

/**
 * `strictQuery` makes Mongoose drop query keys that are not in the schema
 * rather than passing them through to the driver. Combined with the zod layer
 * this closes off query-shape injection.
 */
mongoose.set('strictQuery', true);

if (!env.isProduction) {
  mongoose.set('debug', (collection, method, query) =>
    logger.debug({ collection, method, query }, 'mongo'),
  );
}

let connectionPromise: Promise<typeof mongoose> | null = null;

/**
 * Connects once and memoizes the promise.
 *
 * Memoizing matters on serverless platforms (this app deploys to Vercel):
 * every warm invocation re-enters the module, and without the cache each one
 * would open a fresh pool until the cluster runs out of connections.
 */
export function connectToDatabase(): Promise<typeof mongoose> {
  if (connectionPromise) return connectionPromise;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'MongoDB error'));

  connectionPromise = mongoose
    .connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      // Fail fast instead of buffering commands forever behind a dead socket.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryWrites: true,
    })
    .catch((error: unknown) => {
      // Reset so a later attempt can retry rather than reusing a rejected promise.
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
}

export async function disconnectFromDatabase(): Promise<void> {
  connectionPromise = null;
  await mongoose.connection.close(false);
}

/** Native handle, used by the GridFS bucket. */
export function getDb() {
  const { db } = mongoose.connection;
  if (!db) throw new Error('Database connection is not ready');
  return db;
}
