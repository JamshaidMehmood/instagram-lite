import { DEMO } from '../support/env';
import { expect, openFirstPostFrom, signIn, test } from '../support/fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('feed', () => {
  test('renders posts from the accounts the viewer follows', async ({ page }) => {
    await signIn(page);

    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('includes your own posts, which is what makes it your feed', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('main').getByText(DEMO.name).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('liking is optimistic and survives a reload', async ({ page }) => {
    await signIn(page);

    const like = page.getByRole('button', { name: 'Like this post' }).first();
    await expect(like).toBeVisible({ timeout: 20_000 });
    await like.click();

    await expect(page.getByRole('button', { name: 'Unlike this post' }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Unlike this post' }).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Unlike this post' }).first().click();
    await expect(page.getByRole('button', { name: 'Like this post' }).first()).toBeVisible();
  });

  test('posts a comment and can delete it again', async ({ page }) => {
    await signIn(page);
    await openFirstPostFrom(page, `/u/${DEMO.username}`);

    // The composer sits behind the comment toggle on a card.
    const box = page.getByRole('textbox', { name: /add a comment/i });
    if ((await box.count()) === 0) {
      await page.getByRole('button', { name: /toggle comments/i }).first().click();
    }
    await expect(box).toBeVisible({ timeout: 10_000 });

    const text = `e2e comment ${Date.now()}`;
    await box.fill(text);
    await box.press('Enter');

    await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 });

    // It really persisted, rather than only being spliced into the cache.
    await page.reload();
    if ((await page.getByText(text).count()) === 0) {
      await page.getByRole('button', { name: /toggle comments/i }).first().click();
    }
    await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /delete comment/i }).first().click();
    const confirm = page.getByRole('button', { name: /^delete$/i });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByText(text)).toHaveCount(0, { timeout: 15_000 });
  });

  test('scrolling loads a second page rather than stopping at the first', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    const before = await page.locator('article').count();

    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(1_500);
    await page.mouse.wheel(0, 20_000);

    // Either more posts arrived, or the feed honestly says there are none left.
    const caughtUp = page.getByText(/all caught up/i);
    await expect
      .poll(
        async () =>
          (await page.locator('article').count()) > before || (await caughtUp.count()) > 0,
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test('a post permalink is reachable directly', async ({ page }) => {
    await signIn(page);
    const permalink = await openFirstPostFrom(page, '/explore');

    await page.goto(permalink);
    await expect(
      page.getByRole('button', { name: /like this post|unlike this post/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
