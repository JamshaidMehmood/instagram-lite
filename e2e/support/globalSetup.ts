import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { TEST_DB_NAME } from './env';

/**
 * Resets the test database once, before any spec runs.
 *
 * The suite asserts against known data — the demo account's follower count, a
 * named seeded user in the search results — so it needs a fixed starting point.
 * It reuses the app's own `npm run seed` rather than inserting fixtures
 * directly: a fixture that builds documents by hand drifts from the real write
 * path, and would keep passing after the write path broke. The seed pushes
 * images through GridFS and leaves the denormalised counters exactly as the
 * live code would.
 *
 * Note this runs *before* Playwright starts the `webServer` processes, so the
 * API always comes up against an already-seeded database.
 */
export default function globalSetup(): void {
  const backend = path.resolve(__dirname, '../../Backend');

  // eslint-disable-next-line no-console -- global setup has no reporter yet.
  console.log(`\n  Seeding ${TEST_DB_NAME} …`);

  execFileSync('npm', ['run', 'seed'], {
    cwd: backend,
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_DB_NAME: TEST_DB_NAME,
      // The seed refuses to run against production, and rightly so. Be explicit
      // rather than inheriting whatever the developer's shell happens to hold.
      NODE_ENV: 'development',
      LOG_LEVEL: 'warn',
    },
  });
}
