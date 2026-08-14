import type { Page } from '@playwright/test';

import { DEMO } from '../support/env';
import { expect, signIn, test } from '../support/fixtures';

/**
 * The desktop sidebar labels this control by what it switches *to* ("Dark
 * mode"), while the mobile bar and the auth pages use a generic aria-label.
 * One locator that accepts either keeps this spec running on both projects.
 */
const colourModeToggle = (page: Page) =>
  page.getByRole('button', { name: /dark mode|light mode|toggle colour mode/i }).first();

/**
 * Runs on both the desktop and the mobile project. The two layouts are
 * genuinely different components — a fixed sidebar versus a top bar plus a
 * bottom bar — driven from one shared `buildNavItems` list, so this is the spec
 * that proves they have not drifted apart.
 */
test.describe('navigation', () => {
  test('every nav destination is reachable', async ({ page }) => {
    await signIn(page);

    const destinations = [
      { name: 'Explore', url: /\/explore$/ },
      { name: 'Search', url: /\/search/ },
      { name: 'Create', url: /\/create$/ },
      { name: 'Activity', url: /\/activity$/ },
      { name: 'Profile', url: new RegExp(`/u/${DEMO.username}$`) },
      { name: 'Home', url: /\/$/ },
    ];

    for (const destination of destinations) {
      await page.getByRole('link', { name: destination.name, exact: false }).first().click();
      await expect(page).toHaveURL(destination.url, { timeout: 15_000 });
    }
  });

  test('an unknown route renders the not-found page instead of a blank screen', async ({ page }) => {
    await signIn(page);
    await page.goto('/definitely-not-a-route');

    await expect(page.getByRole('heading', { name: /this page does ?n.t exist/i })).toBeVisible();
  });

  test('the colour mode toggle works and sticks', async ({ page }) => {
    await signIn(page);

    const background = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    const before = await background();
    await colourModeToggle(page).click();
    await expect.poll(background, { timeout: 5_000 }).not.toBe(before);

    await page.reload();
    // The choice is remembered rather than snapping back on every load.
    await expect.poll(background, { timeout: 15_000 }).not.toBe(before);

    await colourModeToggle(page).click();
  });
});
