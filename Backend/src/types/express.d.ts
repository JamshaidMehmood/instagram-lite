import type { AuthUser } from '../modules/auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by `requireAuth` / `optionalAuth` from a verified access
       * token. Handlers must read the actor from here — never from the request
       * body, which the client controls.
       */
      user?: AuthUser;
    }
  }
}

export {};
