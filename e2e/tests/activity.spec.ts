import type { Browser, Page } from '@playwright/test';

import { DEMO, MEMBER_PASSWORD, STRANGER } from '../support/env';
import {
  expect,
  likeFreshly,
  openFirstPostFrom,
  signIn,
  test,
  unlikeAndSettle,
} from '../support/fixtures';

test.describe.configure({ mode: 'serial' });

/**
 * The sentence an activity row reads.
 *
 * Two things about the markup drive this locator. The row body renders the
 * *username* (`ActivityPage.tsx:82`) — the display name reaches the DOM only in
 * the avatar's `aria-label`, which `getByText` cannot see. And JSX drops the
 * whitespace between the username link and the verb, so the paragraph's text is
 * literally `mariamliked your photo`: hence `\s*` rather than a space.
 *
 * `^…$` pins the match to the paragraph itself, so no ancestor whose combined
 * text happens to contain both halves can satisfy it.
 */
function sentence(page: Page, verb: string) {
  return page.getByText(new RegExp(`^${STRANGER.username}\\s*${verb}$`, 'i'));
}

/**
 * The row for one *specific* like, identified by the post it points at.
 *
 * Scoping to the post is what makes these assertions mean anything: the seed
 * already makes mariam a liker of both of the demo's posts, so
 * "mariam liked your photo" is on this page permanently for the other one. A
 * locator keyed on actor and verb alone could never reach zero.
 *
 * The thumbnail is the only element on the row that names the post, and its
 * `aria-label` carries the actor and the verb too, so it identifies exactly one
 * notification.
 *
 * Deliberately *not* a count of rendered rows: the list is cursor-paginated 9 at
 * a time and auto-loads further pages as the sentinel comes into view, so how
 * many rows exist at any instant is a race. Scoping by post sidesteps that —
 * a new notification is the newest, so it is always on the first page.
 */
function likeRowFor(page: Page, postUrl: string) {
  const path = new URL(postUrl).pathname;
  return page.locator(
    `a[href="${path}"][aria-label="View the post ${STRANGER.username} liked"]`,
  );
}

/**
 * These drive two accounts at once, in separate browser contexts, because the
 * thing under test is one person's action turning up in another person's
 * activity feed. A single-session test could only prove that a row renders —
 * not that the write path which produces it actually fires.
 */
async function asStranger(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, STRANGER.email, MEMBER_PASSWORD);
  return { context, page };
}

async function asDemo(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  return { context, page };
}

test.describe('activity feed', () => {
  test('a like by someone else becomes an activity row', async ({ browser }) => {
    const stranger = await asStranger(browser);
    const demo = await asDemo(browser);

    try {
      const postUrl = await openFirstPostFrom(stranger.page, `/u/${DEMO.username}`);
      await likeFreshly(stranger.page);

      await demo.page.goto('/activity');
      await expect(likeRowFor(demo.page, postUrl)).toBeVisible({ timeout: 15_000 });
      // …and the row reads as a sentence, which the thumbnail alone would not
      // prove: a regression in `describeAction` would leave it blank.
      await expect(sentence(demo.page, 'liked your photo').first()).toBeVisible();

      // Restore the seeded like state for the specs that follow.
      await unlikeAndSettle(stranger.page);
    } finally {
      await stranger.context.close();
      await demo.context.close();
    }
  });

  test('unliking takes the notification back rather than leaving a lie', async ({ browser }) => {
    const stranger = await asStranger(browser);
    const demo = await asDemo(browser);

    try {
      const postUrl = await openFirstPostFrom(stranger.page, `/u/${DEMO.username}`);
      await likeFreshly(stranger.page);

      await demo.page.goto('/activity');
      const row = likeRowFor(demo.page, postUrl);
      await expect(row).toBeVisible({ timeout: 15_000 });

      await unlikeAndSettle(stranger.page);

      await demo.page.reload();
      await demo.page.waitForLoadState('networkidle');
      await expect(row).toHaveCount(0);
    } finally {
      await stranger.context.close();
      await demo.context.close();
    }
  });

  test('a follow becomes a row with a follow-back button', async ({ browser }) => {
    const stranger = await asStranger(browser);
    const demo = await asDemo(browser);

    try {
      await stranger.page.goto(`/u/${DEMO.username}`);
      await stranger.page.getByRole('button', { name: `Follow @${DEMO.username}` }).click();
      await expect(
        stranger.page.getByRole('button', { name: `Unfollow @${DEMO.username}` }),
      ).toBeVisible();

      await demo.page.goto('/activity');
      // Unlike the like rows, the seed leaves no mariam follow, so the actor
      // and verb identify this row on their own.
      await expect(sentence(demo.page, 'started following you').first()).toBeVisible({
        timeout: 15_000,
      });

      // A follow row offers the obvious next action instead of a dead thumbnail.
      await expect(
        demo.page.getByRole('button', { name: `Follow @${STRANGER.username}` }).first(),
      ).toBeVisible();

      await stranger.page.getByRole('button', { name: `Unfollow @${DEMO.username}` }).click();
      await expect(
        stranger.page.getByRole('button', { name: `Follow @${DEMO.username}` }),
      ).toBeVisible();
    } finally {
      await stranger.context.close();
      await demo.context.close();
    }
  });

  test('opening activity clears the unread badge', async ({ page }) => {
    await signIn(page);

    // The badge is rendered into the nav item's accessible name, so the count
    // is readable without reaching for an implementation detail.
    const activityNav = page.getByRole('link', { name: /activity/i }).first();
    await expect(activityNav).toBeVisible();

    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Everything read means the badge renders 0 and MUI hides it.
    await expect(activityNav).not.toHaveText(/[1-9]/, { timeout: 15_000 });
  });
});
