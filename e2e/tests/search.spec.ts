import { FOLLOWED, STRANGER } from '../support/env';
import { expect, signIn, test } from '../support/fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('search', () => {
  test('finds an account by name and by username', async ({ page }) => {
    await signIn(page);
    await page.goto('/search');

    const input = page.getByRole('searchbox', { name: /search people/i });
    await expect(input).toBeVisible();

    await input.fill(STRANGER.username);
    await expect(page.getByText(STRANGER.name)).toBeVisible({ timeout: 15_000 });

    // The name half of the query matches too, not only the username prefix.
    await input.fill('Ayesha');
    await expect(page.getByText(FOLLOWED.name)).toBeVisible({ timeout: 15_000 });
  });

  test('says so when nothing matches, rather than showing an empty page', async ({ page }) => {
    await signIn(page);
    await page.goto('/search');

    await page.getByRole('searchbox', { name: /search people/i }).fill('zzzznobodyzzzz');
    await expect(page.getByText(/no people found/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('survives a regex-shaped query instead of matching everything', async ({ page }) => {
    await signIn(page);
    await page.goto('/search');

    // An unescaped `.*` would match every account; `(((` would throw or hang.
    await page.getByRole('searchbox', { name: /search people/i }).fill('.*');
    await expect(page.getByText(/no people found/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('searchbox', { name: /search people/i }).fill('(((');
    await expect(page.getByText(/no people found/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('keeps the term in the URL so a search is shareable', async ({ page }) => {
    await signIn(page);
    await page.goto('/search');

    await page.getByRole('searchbox', { name: /search people/i }).fill(STRANGER.username);
    await expect(page).toHaveURL(new RegExp(`q=${STRANGER.username}`), { timeout: 15_000 });

    // And restoring that URL restores the search.
    await page.reload();
    await expect(page.getByText(STRANGER.name)).toBeVisible({ timeout: 15_000 });
  });

  test('following from the results updates that row', async ({ page }) => {
    await signIn(page);
    await page.goto(`/search?q=${STRANGER.username}`);

    const follow = page.getByRole('button', { name: `Follow @${STRANGER.username}` });
    await expect(follow).toBeVisible({ timeout: 15_000 });
    await follow.click();

    // The result row has its own cache entry, separate from the profile and the
    // suggestions panel — an unpatched one leaves this button saying "Follow".
    await expect(page.getByRole('button', { name: `Unfollow @${STRANGER.username}` })).toBeVisible();

    await page.getByRole('button', { name: `Unfollow @${STRANGER.username}` }).click();
    await expect(page.getByRole('button', { name: `Follow @${STRANGER.username}` })).toBeVisible();
  });
});
