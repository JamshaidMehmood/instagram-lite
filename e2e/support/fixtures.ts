import { expect, test as base, type Page, type Response } from '@playwright/test';

import { DEMO, MEMBER_PASSWORD } from './env';

/**
 * Signs in through the real form rather than by injecting a token.
 *
 * The session is an in-memory access token plus an httpOnly refresh cookie, so
 * there is nothing a test could plant in localStorage anyway — and going
 * through the form means every spec also proves the login path still works.
 */
export async function signIn(
  page: Page,
  email: string = DEMO.email,
  password: string = DEMO.password,
): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expectSignedIn(page);
}

export async function signInAsMember(page: Page, email: string): Promise<void> {
  await signIn(page, email, MEMBER_PASSWORD);
}

/**
 * The one control that exists on every signed-in screen in both layouts — a
 * labelled item in the desktop sidebar, an icon button in the mobile top bar.
 *
 * Waiting on this rather than on the URL matters: the router renders the guard
 * before `SessionBootstrap` has resolved, so `/` is reached a beat before the
 * session actually exists, and an assertion made in that gap races a screen
 * that is about to be replaced.
 */
export function signOutControl(page: Page) {
  return page.getByRole('button', { name: 'Sign out' });
}

export async function expectSignedIn(page: Page): Promise<void> {
  await expect(signOutControl(page)).toBeVisible({ timeout: 25_000 });
}

export async function signOut(page: Page): Promise<void> {
  await signOutControl(page).click();
  await expect(page).toHaveURL(/\/signin$/, { timeout: 15_000 });
}

/**
 * Opens a post's permalink page and returns its URL.
 *
 * Permalinks come from a *grid* — Explore or a profile — not from the feed:
 * a feed card renders the photo full-width with a "Copy link to post" action
 * rather than wrapping itself in an anchor, so there is no `/p/:id` href to
 * click there. Tests that need a permalink have to start from a grid.
 */
export async function openFirstPostFrom(page: Page, gridPath: string): Promise<string> {
  await page.goto(gridPath);
  const cell = page.locator('a[href^="/p/"]').first();
  await expect(cell).toBeVisible({ timeout: 20_000 });
  await cell.click();
  await expect(page).toHaveURL(/\/p\/[a-f0-9]{24}$/, { timeout: 15_000 });
  return page.url();
}

/** The like endpoint, either direction: `/api/v1/posts/:id/likes`. */
function likeRequest(method: 'POST' | 'DELETE') {
  return (response: Response) =>
    response.request().method() === method &&
    /\/posts\/[a-f0-9]{24}\/likes$/.test(new URL(response.url()).pathname);
}

/**
 * Drives a post into the "liked by me" state, whichever state it starts in.
 *
 * The seed already spreads likes across accounts, so a spec cannot assume its
 * chosen post is un-liked. Toggling off and on again also guarantees a *fresh*
 * notification rather than relying on one the seed happened to create.
 *
 * Each direction waits for its own request to come back, not merely for the
 * button to flip. The flip is optimistic and happens in the same tick as the
 * click, so waiting on it alone would fire the POST while the DELETE was still
 * in flight — two conflicting writes to the same row, whose outcome depends on
 * which one the server happens to finish last. That is a genuinely
 * non-deterministic test, and it fails roughly whenever the DELETE wins.
 */
export async function likeFreshly(page: Page): Promise<void> {
  const like = page.getByRole('button', { name: 'Like this post' });
  const unlike = page.getByRole('button', { name: 'Unlike this post' });

  if ((await unlike.count()) > 0) {
    const removed = page.waitForResponse(likeRequest('DELETE'));
    await unlike.first().click();
    await removed;
    await expect(like.first()).toBeVisible();
  }

  const added = page.waitForResponse(likeRequest('POST'));
  await like.first().click();
  await added;
  await expect(unlike.first()).toBeVisible();
}

/**
 * Un-likes a post and waits for the server to agree.
 *
 * The waiting matters most when this is a spec's *last* act: the button flips
 * optimistically, so a test that asserts the flip and then closes its browser
 * context aborts the DELETE in flight — leaving the like, and its notification,
 * behind for whichever spec runs next.
 */
export async function unlikeAndSettle(page: Page): Promise<void> {
  const removed = page.waitForResponse(likeRequest('DELETE'));
  await page.getByRole('button', { name: 'Unlike this post' }).first().click();
  await removed;
  await expect(page.getByRole('button', { name: 'Like this post' }).first()).toBeVisible();
}

/**
 * Fails the test on unexpected console errors.
 *
 * A React key warning or an unhandled promise rejection is exactly the kind of
 * thing that never fails an assertion but always means something is wrong. The
 * allowlist covers noise the app does not control.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  // The Google Identity script is third-party and blocked in offline runs; the
  // button's own failure path is asserted explicitly in the auth spec instead.
  /accounts\.google\.com/i,
  /gsi\/client/i,
  // Create React App's dev server injects an HMR socket that reconnects noisily.
  /sockjs|webpack|hot-update|\[HMR\]/i,
  // A 4xx logs here as well as resolving the promise the app already handles;
  // the specs assert the resulting UI, which is the part that matters.
  /Failed to load resource/i,
];

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
        errors.push(text);
      });

      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

      await use();

      expect(errors, `unexpected console errors:\n${errors.join('\n')}`).toHaveLength(0);
    },
    { auto: true },
  ],
});

export { expect };
