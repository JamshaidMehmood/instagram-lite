import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { MongoServerError } from 'mongodb';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { RefreshToken } from '../../models/RefreshToken';
import { User, type UserDocument } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../utils/jwt';
import { toCurrentUser, type CurrentUserDTO } from '../users/user.dto';
import { RESERVED_USERNAMES } from '../users/user.schema';
import type { IssuedSession, SessionContext } from './auth.types';
import type { GoogleAuthInput, LoginInput, SignupInput } from './auth.schema';

/** Palette the avatar colour is picked from at signup. */
const AVATAR_COLORS = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
] as const;

function pickAvatarColor(): string {
  const index = crypto.randomInt(AVATAR_COLORS.length);
  return AVATAR_COLORS[index] ?? '#6366F1';
}

/**
 * Comparing against a throwaway hash on the "no such user" path keeps failed
 * logins the same cost whether or not the email exists. Returning early
 * instead would make the response time a working oracle for enumerating
 * registered addresses.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS);
  return dummyHashPromise;
}

function usernameSeedFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._]/g, '');
  return cleaned.length >= 3 ? cleaned.slice(0, 24) : `user${cleaned}`.slice(0, 24);
}

export interface AuthResult {
  user: CurrentUserDTO;
  session: IssuedSession;
}

/**
 * Mints an access token plus a rotating refresh token.
 *
 * `family` ties every token descended from one login together so that reuse
 * of a rotated token can invalidate the entire lineage — see `rotateSession`.
 */
async function issueSession(user: UserDocument, context: SessionContext): Promise<IssuedSession> {
  const { token, tokenHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlMs);

  await RefreshToken.create({
    user: user._id,
    tokenHash,
    family: crypto.randomUUID(),
    expiresAt,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return {
    accessToken: signAccessToken({
      id: String(user._id),
      email: user.email,
      username: user.username,
      name: user.name,
    }),
    refreshToken: token,
    refreshTokenExpiresAt: expiresAt,
  };
}

interface NewUserAttributes {
  name: string;
  email: string;
  /** Absent for Google-only accounts, which have nothing to compare against. */
  password?: string;
  googleId?: string;
  avatarUrl?: string;
}

/**
 * Creates an account under a username derived from its email address.
 *
 * Shared by password signup and Google sign-up so the two cannot drift: both
 * need the same retry, and a second copy of it would be a second thing to get
 * wrong. Usernames are auto-derived, so collisions are expected. Rather than
 * read-then-write (which races), we attempt the insert and let the unique
 * index reject duplicates, retrying with a fresh suffix.
 */
async function createUserWithDerivedUsername(
  attributes: NewUserAttributes,
): Promise<UserDocument> {
  const seed = usernameSeedFromEmail(attributes.email);

  /**
   * A reserved seed is treated exactly like a taken one — straight to the
   * suffixed retry. `search@example.com` would otherwise derive the username
   * `search`, which is a literal segment on the users router and would leave
   * that account's profile permanently unreachable.
   */
  const seedIsUsable = !RESERVED_USERNAMES.has(seed);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username =
      attempt === 0 && seedIsUsable ? seed : `${seed.slice(0, 20)}${crypto.randomInt(1000, 9999)}`;

    try {
      return await User.create({ ...attributes, username, avatarColor: pickAvatarColor() });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        if (error.keyPattern?.['email']) {
          throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
        }
        if (error.keyPattern?.['username']) continue; // try another suffix
      }
      // Anything else — including a googleId collision, which a retry could
      // never resolve — is the caller's to interpret.
      throw error;
    }
  }

  throw ApiError.internal('Could not allocate a username. Please try again.');
}

export async function register(input: SignupInput, context: SessionContext): Promise<AuthResult> {
  const user = await createUserWithDerivedUsername({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  return { user: toCurrentUser(user), session: await issueSession(user, context) };
}

export async function login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+password');

  if (!user) {
    await bcrypt.compare(input.password, await getDummyHash());
    throw ApiError.badRequest('Email or password is incorrect');
  }

  if (!user.password) {
    // This does reopen the oracle the comment above guards, for exactly one
    // class of address: a distinct message here confirms that this account
    // exists and is Google-backed. Deliberate. The uniform message would leave
    // someone who signed up with Google in a permanent "wrong password" loop
    // with no password to correct and no hint that another door exists — an
    // unfixable dead end traded against a narrow disclosure about an address
    // the attacker already had to know.
    throw ApiError.badRequest(
      'This account was created with Google. Use "Continue with Google" to sign in.',
    );
  }

  const matches = await user.comparePassword(input.password);
  if (!matches) {
    // Same message either way: telling the caller *which* half was wrong
    // confirms whether an address is registered.
    throw ApiError.badRequest('Email or password is incorrect');
  }

  return { user: toCurrentUser(user), session: await issueSession(user, context) };
}

/**
 * One client per process, built on first use.
 *
 * `verifyIdToken` checks the token against Google's published signing keys and
 * the client caches them; a client constructed per request would re-fetch that
 * certificate set on every sign-in. Lazy rather than eager because the module
 * still has to load on a deployment that never configured Google.
 */
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  googleClient ??= new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return googleClient;
}

/** The `name` claim is free text; the schema is not. */
function displayNameFrom(payload: TokenPayload, email: string): string {
  const candidate = payload.name?.trim() || email.split('@')[0] || '';
  return candidate.length >= 2 ? candidate.slice(0, 60) : 'Google User';
}

/**
 * Maps a verified Google identity onto an account, creating one if needed.
 *
 * Matching on `sub` first matters: it is the only claim Google promises never
 * changes, whereas an address can be reassigned between accounts.
 */
async function findOrCreateGoogleUser(payload: TokenPayload, email: string): Promise<UserDocument> {
  const linked = await User.findOne({ googleId: payload.sub });
  if (linked) return linked;

  const existing = await User.findOne({ email });
  if (existing) {
    // Same verified address, so the same person: link rather than refuse with
    // EMAIL_TAKEN, which would strand anyone who signed up with a password and
    // later reached for the Google button.
    existing.googleId = payload.sub;
    // Backfill only. Overwriting on every sign-in would silently undo a picture
    // the user chose here.
    if (!existing.avatarUrl && payload.picture) existing.avatarUrl = payload.picture;
    await existing.save();
    return existing;
  }

  try {
    return await createUserWithDerivedUsername({
      name: displayNameFrom(payload, email),
      email,
      avatarUrl: payload.picture ?? '',
      googleId: payload.sub,
    });
  } catch (error) {
    // Two tabs pressed the button at once: one insert won, the other tripped a
    // unique index. The loser re-reads instead of reporting a conflict, because
    // the account it was trying to create now exists and is the same account.
    const winner = await User.findOne({ googleId: payload.sub });
    if (winner) return winner;
    throw error;
  }
}

/**
 * Sign-in and sign-up over a Google Identity Services ID token.
 *
 * Once an account is resolved the flow rejoins password login exactly —
 * same access token, same rotating refresh cookie — so nothing downstream of
 * here can tell how the caller authenticated.
 */
export async function loginWithGoogle(
  input: GoogleAuthInput,
  context: SessionContext,
): Promise<AuthResult> {
  if (!env.googleEnabled) {
    throw ApiError.serviceUnavailable('Google sign-in is not configured on this server');
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: input.idToken,
      // Without an audience the library accepts tokens minted for *any* Google
      // client, so a token issued to some unrelated site would sign its bearer
      // in here.
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    // The library's messages name certificates, clock skew and audiences: worth
    // logging, but handing them to the caller only helps someone probing for a
    // token this server would accept.
    logger.warn({ err: error }, 'Google ID token verification failed');
    throw ApiError.unauthorized('Could not verify that Google account');
  }

  const email = payload?.email?.trim().toLowerCase();
  if (!payload || !email) throw ApiError.unauthorized('Could not verify that Google account');

  // Load-bearing, not a formality. `findOrCreateGoogleUser` treats a matching
  // address as proof that this Google account owns the local one; an
  // unverified claim would let anyone add someone else's address to a Google
  // account and walk into the account already holding it.
  if (payload.email_verified !== true) {
    throw ApiError.unauthorized('That Google account has no verified email address');
  }

  const user = await findOrCreateGoogleUser(payload, email);

  return { user: toCurrentUser(user), session: await issueSession(user, context) };
}

/**
 * Exchanges a refresh token for a new pair and invalidates the old one.
 *
 * Rotation means a stolen token is only useful until the legitimate client
 * next refreshes. When a token that was already rotated comes back, that is
 * proof two parties hold the same secret, so the whole family is revoked and
 * both are forced to re-authenticate.
 */
export async function rotateSession(
  rawToken: string,
  context: SessionContext,
): Promise<{ user: CurrentUserDTO; session: IssuedSession }> {
  const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawToken) });

  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    logger.warn(
      { userId: String(stored.user), family: stored.family, ip: context.ip },
      'Refresh token reuse detected — revoking token family',
    );
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  const user = await User.findById(stored.user);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  const { token, tokenHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlMs);

  stored.revokedAt = new Date();
  await stored.save();

  await RefreshToken.create({
    user: user._id,
    tokenHash,
    family: stored.family, // stays in the same lineage
    expiresAt,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return {
    user: toCurrentUser(user),
    session: {
      accessToken: signAccessToken({
        id: String(user._id),
        email: user.email,
        username: user.username,
        name: user.name,
      }),
      refreshToken: token,
      refreshTokenExpiresAt: expiresAt,
    },
  };
}

/** Idempotent: logging out with an unknown or already-revoked token succeeds. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
