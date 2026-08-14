import { DEMO } from '../support/env';
import { expect, openFirstPostFrom, signIn, test } from '../support/fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('saved posts', () => {
  test('bookmarking puts the post in the Saved tab and unsaving takes it out', async ({ page }) => {
    await signIn(page);

    // Start from Explore so the post is guaranteed not to be one of the two the
    // seed already saved for this account.
    const permalink = await openFirstPostFrom(page, '/explore');
    const path = new URL(permalink).pathname;

    const save = page.getByRole('button', { name: 'Save post' });
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByRole('button', { name: 'Remove from saved' })).toBeVisible();

    await page.goto(`/u/${DEMO.username}`);
    await page.getByRole('tab', { name: /saved/i }).click();
    await expect(page.locator(`a[href="${path}"]`)).toBeVisible({ timeout: 15_000 });

    await page.goto(path);
    await page.getByRole('button', { name: 'Remove from saved' }).click();
    await expect(page.getByRole('button', { name: 'Save post' })).toBeVisible();

    await page.goto(`/u/${DEMO.username}`);
    await page.getByRole('tab', { name: /saved/i }).click();
    await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0, { timeout: 15_000 });
  });

  test('the bookmark persists, so the write really reached the server', async ({ page }) => {
    await signIn(page);
    const permalink = await openFirstPostFrom(page, '/explore');

    await page.getByRole('button', { name: 'Save post' }).click();
    await expect(page.getByRole('button', { name: 'Remove from saved' })).toBeVisible();

    // A reload drops every optimistic patch, so what survives is server state.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove from saved' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Remove from saved' }).click();
    await expect(page.getByRole('button', { name: 'Save post' })).toBeVisible();

    expect(permalink).toMatch(/\/p\//);
  });

  test('the Saved tab is populated and distinct from POSTS', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    // The seed leaves the demo account with saved posts, so this asserts real
    // content rather than the empty state.
    await page.getByRole('tab', { name: /saved/i }).click();
    await expect(page.locator('main a[href^="/p/"]').first()).toBeVisible({ timeout: 15_000 });
    const saved = await page.locator('main a[href^="/p/"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href')),
    );

    await page.getByRole('tab', { name: /posts/i }).click();
    await expect(page.locator('main a[href^="/p/"]').first()).toBeVisible({ timeout: 15_000 });
    const own = await page.locator('main a[href^="/p/"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href')),
    );

    // Two tabs, two queries — not one list with a filter applied to it.
    expect(saved.join()).not.toBe(own.join());
  });
});
