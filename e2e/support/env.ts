/**
 * Ports and names shared by the Playwright config, the global setup and the
 * specs. Deliberately *not* the app's own defaults: a test run must never be
 * able to talk to — or reset — the database a developer is working in.
 */

/** :5001, not the app's :5000. */
export const API_PORT = Number(process.env['E2E_API_PORT'] ?? 5001);

/** :3001, not CRA's :3000. */
export const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 3001);

export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * A dedicated database. `globalSetup` truncates it on every run, so pointing
 * this at `instagram_lite` would silently destroy a developer's data.
 */
export const TEST_DB_NAME = process.env['E2E_DB_NAME'] ?? 'instagram_lite_e2e';

/** Mirrors the seed script's demo account and the SPA's `DEMO_CREDENTIALS`. */
export const DEMO = {
  email: 'demo@example.com',
  password: 'Demo1234',
  username: 'demo',
  name: 'Demo User',
} as const;

/** Every other seeded member shares this password. */
export const MEMBER_PASSWORD = 'Password1';

/**
 * The one seeded account the demo user does *not* follow.
 *
 * Every follow test needs a target that starts un-followed, and every test that
 * needs a second live session needs someone whose feed does not already contain
 * the demo account's posts. The seed's follow offsets leave exactly one such
 * account, so this is asserted in `follow.spec.ts` rather than merely assumed —
 * if the seed's graph changes, that assertion fails loudly instead of the
 * follow tests quietly passing against an already-followed user.
 */
export const STRANGER = {
  username: 'mariam',
  email: 'mariam@example.com',
  name: 'Mariam Farooq',
} as const;

/** A seeded account the demo user already follows, for the unfollow direction. */
export const FOLLOWED = {
  username: 'ayesha',
  email: 'ayesha@example.com',
  name: 'Ayesha Khan',
} as const;
