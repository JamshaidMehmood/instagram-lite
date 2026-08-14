/** The verified identity of the caller, attached to `req.user` by `requireAuth`. */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
}

/** Where a session was created from — recorded for auditing and revocation. */
export interface SessionContext {
  userAgent: string;
  ip: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
