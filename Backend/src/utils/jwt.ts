import crypto from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';
import type { AuthUser } from '../modules/auth/auth.types';
import { ApiError } from './ApiError';

const ISSUER = 'instagram-lite';
const AUDIENCE = 'instagram-lite-web';

interface AccessTokenClaims {
  sub: string;
  email: string;
  username: string;
  name: string;
}

/**
 * Access tokens are short-lived (15 minutes by default) and carry just enough
 * identity to render a UI without a lookup. The previous implementation signed
 * tokens with no expiry at all, which made every token ever issued valid
 * forever with no way to revoke it.
 */
export function signAccessToken(user: AuthUser): string {
  const claims: AccessTokenClaims = {
    sub: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
  };

  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
  };

  return jwt.sign(claims, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AuthUser {
  // `issuer`/`audience` are verified, not merely present: without them a token
  // minted by any other service sharing the secret would be accepted here.
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (typeof decoded === 'string' || !decoded.sub) {
    throw ApiError.unauthorized('Malformed access token');
  }

  const claims = decoded as jwt.JwtPayload & Omit<AccessTokenClaims, 'sub'>;

  return {
    id: String(claims.sub),
    email: claims.email,
    username: claims.username,
    name: claims.name,
  };
}

/**
 * Refresh tokens are opaque random bytes rather than JWTs — a JWT cannot be
 * revoked before it expires, and revocation is the entire point of a refresh
 * token. Only the SHA-256 hash is persisted.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
