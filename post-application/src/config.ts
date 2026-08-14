/**
 * `REACT_APP_API_URL` is baked in at build time by Create React App. The
 * fallback keeps `npm start` working with no `.env` present.
 */
export const API_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:5000/api/v1';

/** Origin without the version prefix — media paths are absolute from the root. */
export const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');

/**
 * The API returns image paths relative to its own origin (`/api/v1/media/…`).
 * The SPA is served from a different origin in every environment, so an `<img
 * src>` needs them qualified.
 *
 * Three kinds of string reach this now and only one of them wants the origin:
 * our own relative media paths, absolute `http(s)` URLs (a Google profile
 * photo), and `blob:`/`data:` URLs (the local preview held while an avatar
 * upload is still in flight). Prefixing either of the last two would corrupt a
 * URL that was already complete, so they pass through untouched.
 */
export function mediaSrc(path: string): string {
  return /^(https?:|blob:|data:)/.test(path) ? path : `${API_ORIGIN}${path}`;
}

/** Posts fetched per page. Small enough that the first screen paints fast. */
export const PAGE_SIZE = 6;

/**
 * Google Identity Services client ID.
 *
 * This is public by design — it ships inside the bundle and identifies the app
 * to Google, it does not authenticate it. The credential that matters is the ID
 * token Google mints, which the API verifies against Google's keys before it
 * trusts a single field on it. Empty when unconfigured, which is the signal for
 * `GoogleSignInButton` to render nothing rather than a button that cannot work.
 */
export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID ?? '';

/**
 * The seeded demo account, offered as a one-click sign-in so a first-time
 * visitor can look around without registering. Must match the `DEMO` constant
 * in the backend's `src/scripts/seed.ts`.
 */
export const DEMO_CREDENTIALS = {
  email: 'demo@example.com',
  password: 'Demo1234',
} as const;

/**
 * Must stay in step with the API's `MAX_UPLOAD_BYTES`. Checking here as well
 * is not a security control — the server is authoritative — it just means an
 * oversized file is rejected instantly instead of after an 8 MB upload.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const MAX_CAPTION_LENGTH = 2200;
