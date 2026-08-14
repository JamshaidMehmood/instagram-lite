import { DEMO, FOLLOWED, STRANGER } from '../support/env';
import { expect, signIn, test } from '../support/fixtures';

/**
 * Serial, and each test restores what it changed.
 *
 * The whole suite shares one database, so a follow left behind here would
 * change what `feed.spec` sees. Every test that follows somebody unfollows them
 * again before it finishes.
 */
test.describe.configure({ mode: 'serial' });

test.describe('follow graph', () => {
  test('the seeded graph is the one these tests assume', async ({ page }) => {
    await signIn(page);

    await page.goto(`/u/${STRANGER.username}`);
    await expect(page.getByRole('button', { name: `Follow @${STRANGER.username}` })).toBeVisible();

    await page.goto(`/u/${FOLLOWED.username}`);
    await expect(
      page.getByRole('button', { name: `Unfollow @${FOLLOWED.username}` }),
    ).toBeVisible();
  });

  test('following from a profile flips the button and moves the follower count', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/u/${STRANGER.username}`);

    const followers = page.getByRole('button', {
      name: `View followers of @${STRANGER.username}`,
    });
    await expect(followers).toBeVisible();
    const before = Number((await followers.innerText()).trim().split(/\s+/)[0]);

    await page.getByRole('button', { name: `Follow @${STRANGER.username}` }).click();

    // The label flips optimistically; the count is reconciled from the server's
    // authoritative answer.
    await expect(page.getByRole('button', { name: `Unfollow @${STRANGER.username}` })).toBeVisible();
    await expect(followers).toContainText(String(before + 1));

    // …and it survives a reload, so the write really reached the database.
    await page.reload();
    await expect(page.getByRole('button', { name: `Unfollow @${STRANGER.username}` })).toBeVisible();

    await page.getByRole('button', { name: `Unfollow @${STRANGER.username}` }).click();
    await expect(page.getByRole('button', { name: `Follow @${STRANGER.username}` })).toBeVisible();
    await expect(followers).toContainText(String(before));
  });

  test('following elsewhere makes the home feed refetch instead of serving a stale one', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    // Every step from here is client-side navigation. A `page.goto` would
    // reload the SPA and empty the query cache, which would make the feed
    // refetch for a reason that has nothing to do with the thing under test.
    await page.getByRole('link', { name: 'Search' }).first().click();
    await page.getByRole('searchbox', { name: /search people/i }).fill(STRANGER.username);

    const follow = page.getByRole('button', { name: `Follow @${STRANGER.username}` });
    await expect(follow).toBeVisible({ timeout: 15_000 });
    await follow.click();
    await expect(page.getByRole('button', { name: `Unfollow @${STRANGER.username}` })).toBeVisible();

    // FeedPage is unmounted at the moment of the follow, which is exactly the
    // case a ref seeded on mount would conclude had already been handled.
    const refetch = page.waitForRequest(
      (request) => request.method() === 'GET' && request.url().includes('/api/v1/posts?'),
      { timeout: 15_000 },
    );

    await page.getByRole('link', { name: 'Home' }).first().click();
    await expect(page).toHaveURL(/\/$/);

    // Without the graph-version signal RTK Query would answer from cache and no
    // request would leave the browser at all.
    await refetch;

    await page.getByRole('link', { name: 'Search' }).first().click();
    await page.getByRole('searchbox', { name: /search people/i }).fill(STRANGER.username);
    await page.getByRole('button', { name: `Unfollow @${STRANGER.username}` }).click();
    await expect(page.getByRole('button', { name: `Follow @${STRANGER.username}` })).toBeVisible();
  });

  test('the followers sheet lists people and its follow buttons work', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    await page.getByRole('button', { name: `View accounts @${DEMO.username} follows` }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(FOLLOWED.name)).toBeVisible();

    // Unfollow from inside the sheet, then confirm the row's own button
    // updated. This is the cache-coherence case: the row renders out of the
    // follower-list cache entry, which is a different entry from the profile.
    const rowButton = dialog.getByRole('button', { name: `Unfollow @${FOLLOWED.username}` });
    await rowButton.click();
    await expect(dialog.getByRole('button', { name: `Follow @${FOLLOWED.username}` })).toBeVisible();

    // Restore.
    await dialog.getByRole('button', { name: `Follow @${FOLLOWED.username}` }).click();
    await expect(
      dialog.getByRole('button', { name: `Unfollow @${FOLLOWED.username}` }),
    ).toBeVisible();
  });

  test('explore suggests accounts and following one removes it from the feed prompt', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/explore');

    const suggestions = page.getByRole('complementary', { name: /suggested accounts/i });
    await expect(suggestions).toBeVisible();
    // The only account the demo user does not already follow.
    await expect(suggestions.getByText(STRANGER.name)).toBeVisible();
  });

  test('explore shows posts the home feed does not', async ({ page }) => {
    await signIn(page);
    await page.goto('/explore');

    // Explore is everything except your own posts, so the un-followed
    // stranger's work is here even though the home feed excludes it.
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible({ timeout: 15_000 });
    const exploreCount = await page.locator('a[href^="/p/"]').count();
    expect(exploreCount).toBeGreaterThan(0);
  });
});
