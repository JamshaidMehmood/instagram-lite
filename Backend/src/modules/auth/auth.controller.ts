import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireUser, validatedBody } from '../../utils/request';
import { toCurrentUser } from '../users/user.dto';
import * as authService from './auth.service';
import type { GoogleAuthInput, LoginInput, SignupInput } from './auth.schema';
import type { IssuedSession, SessionContext } from './auth.types';

const REFRESH_COOKIE = 'ig_refresh';

/**
 * Scoped to the auth path so the browser does not attach it to every feed and
 * media request — it is only ever needed by `/refresh` and `/logout`.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    // Unreadable from JavaScript, so an XSS bug cannot exfiltrate the
    // long-lived credential. The short-lived access token is the only thing
    // the frontend ever holds.
    httpOnly: true,
    secure: env.isProduction,
    // In production the SPA is on a different origin from the API, which
    // requires `none`; `none` is only honoured alongside `secure`.
    sameSite: env.isProduction ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  };
}

function sendSession(res: Response, session: IssuedSession): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(session.refreshTokenExpiresAt));
}

function clearSession(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
}

function sessionContext(req: Request): SessionContext {
  return { userAgent: req.get('user-agent') ?? '', ip: req.ip ?? '' };
}

export const signup = asyncHandler(async (req, res) => {
  const input = validatedBody<SignupInput>(req);
  const { user, session } = await authService.register(input, sessionContext(req));
  sendSession(res, session);
  res.status(201).json({ data: { user, accessToken: session.accessToken } });
});

export const login = asyncHandler(async (req, res) => {
  const input = validatedBody<LoginInput>(req);
  const { user, session } = await authService.login(input, sessionContext(req));
  sendSession(res, session);
  res.status(200).json({ data: { user, accessToken: session.accessToken } });
});

/**
 * Sign-in and sign-up share this one endpoint: Google hands the browser the
 * same credential either way, and only the server can tell whether the account
 * already existed. Hence 200 rather than signup's 201 — the caller asked to be
 * signed in, and whether that created a record is an implementation detail.
 */
export const google = asyncHandler(async (req, res) => {
  const input = validatedBody<GoogleAuthInput>(req);
  const { user, session } = await authService.loginWithGoogle(input, sessionContext(req));
  sendSession(res, session);
  res.status(200).json({ data: { user, accessToken: session.accessToken } });
});

/**
 * Called by the frontend when an access token expires. Rotates the refresh
 * cookie and hands back a fresh access token.
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw ApiError.unauthorized('No active session');

  try {
    const { user, session } = await authService.rotateSession(token, sessionContext(req));
    sendSession(res, session);
    res.status(200).json({ data: { user, accessToken: session.accessToken } });
  } catch (error) {
    // A rejected refresh means the cookie is worthless — drop it so the
    // client stops retrying with a dead credential on every page load.
    clearSession(res);
    throw error;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  clearSession(res);
  res.status(204).send();
});

/**
 * Re-reads the user from the database rather than echoing token claims, so a
 * profile edit is reflected immediately instead of at the next token refresh.
 */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(requireUser(req).id);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  res.status(200).json({ data: toCurrentUser(user) });
});
