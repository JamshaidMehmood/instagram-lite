import { expect, signIn, test } from '../support/fixtures';

/**
 * The mobile project runs this at a phone viewport; the desktop project runs it
 * at 1280×720. Each assertion names which layout it expects, so the same file
 * proves both rather than only whichever one happens to be running.
 */
test.describe('responsive layout', () => {
  test('picks the layout that matches the viewport', async ({ page, isMobile }) => {
    await signIn(page);

    if (isMobile) {
      // Phone: navigation sits in a thumb-reachable bottom bar, and the desktop
      // sidebar is not rendered at all.
      await expect(page.getByRole('navigation', { name: /main navigation/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
    }
  });

  test('never scrolls sideways', async ({ page }) => {
    await signIn(page);

    for (const path of ['/', '/explore', '/search', '/activity']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A horizontal scrollbar on a feed is always a layout bug, and it is the
      // one that only ever shows up on a real viewport.
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
