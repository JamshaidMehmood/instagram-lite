import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at module load, before anything else runs.
 *
 * The previous implementation checked `process.env.SECRET` inside request
 * handlers and called `process.exit(1)` mid-request. Validating here means a
 * misconfigured deployment fails immediately and loudly at boot instead of
 * killing the process on whichever unlucky request arrives first.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1).default('instagram_lite'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Optional on purpose: creating a Google OAuth client is a manual, per-person
  // step, and the rest of the API has nothing to do with it. Requiring this
  // would stop the server booting for everyone who only ever uses password
  // auth. `/auth/google` answers 503 while it is unset; nothing else notices.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console -- the logger depends on env, so it does not exist yet.
  console.error(`\nInvalid environment configuration:\n${issues}\n\nSee .env.example.\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Whether this deployment can verify Google ID tokens at all. */
  googleEnabled: Boolean(raw.GOOGLE_CLIENT_ID),
  /** Refresh cookie / DB record lifetime, in milliseconds. */
  refreshTokenTtlMs: raw.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
} as const;

export type Env = typeof env;
