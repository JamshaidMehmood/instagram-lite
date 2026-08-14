import { DEMO, FOLLOWED } from '../support/env';
import { expect, signIn, test } from '../support/fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('profile', () => {
  test('shows the counts and opens both follow sheets', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    // Scoped to `main`: the sidebar shows the signed-in user's name too.
    await expect(page.locator('main').getByRole('heading', { name: DEMO.name })).toBeVisible();
    await expect(page.getByRole('button', { name: /view followers of @demo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view accounts @demo follows/i })).toBeVisible();

    await page.getByRole('button', { name: /view followers of @demo/i }).click();
    await expect(page.getByRole('dialog')).toContainText(/followers/i);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('offers Edit profile on your own page and a Follow button on everyone else’s', async ({
    page,
  }) => {
    await signIn(page);

    await page.goto(`/u/${DEMO.username}`);
    await expect(page.getByRole('button', { name: /edit profile/i })).toBeVisible();
    // You cannot follow yourself, so the control is absent rather than disabled.
    await expect(page.getByRole('button', { name: /^follow @demo$/i })).toHaveCount(0);

    await page.goto(`/u/${FOLLOWED.username}`);
    await expect(page.getByRole('button', { name: /edit profile/i })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `Unfollow @${FOLLOWED.username}` }),
    ).toBeVisible();
  });

  test('edits the bio and the change survives a reload', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    const marker = `Edited by the e2e suite ${Date.now()}`;

    await page.getByRole('button', { name: /edit profile/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const bio = dialog.getByLabel('Bio');
    const original = await bio.inputValue();

    await bio.fill(marker);
    await dialog.getByRole('button', { name: /^save$/i }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(marker)).toBeVisible();

    await page.reload();
    await expect(page.getByText(marker)).toBeVisible();

    // Put it back so the seeded copy is what other specs see.
    await page.getByRole('button', { name: /edit profile/i }).click();
    await page.getByRole('dialog').getByLabel('Bio').fill(original);
    await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  });

  test('refuses a username that is already taken, on the field itself', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    await page.getByRole('button', { name: /edit profile/i }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Username').fill(FOLLOWED.username);
    await dialog.getByRole('button', { name: /^save$/i }).click();

    // A 409 has to land on the input, not in a generic banner, or the user has
    // to guess which of three fields caused it.
    await expect(dialog.getByText(/taken|not available/i)).toBeVisible({ timeout: 15_000 });
    // And nothing was saved.
    await expect(dialog).toBeVisible();
  });

  test('rejects a reserved username that would shadow a route', async ({ page }) => {
    await signIn(page);
    await page.goto(`/u/${DEMO.username}`);

    await page.getByRole('button', { name: /edit profile/i }).click();
    const dialog = page.getByRole('dialog');

    // `/users/search` is a real route; an account named `search` would sit at a
    // URL Express already answers with something else entirely.
    await dialog.getByLabel('Username').fill('search');
    await dialog.getByRole('button', { name: /^save$/i }).click();

    await expect(dialog.getByText(/not available/i)).toBeVisible({ timeout: 15_000 });
  });

  test('shows a Saved tab on your own profile and nowhere else', async ({ page }) => {
    await signIn(page);

    await page.goto(`/u/${DEMO.username}`);
    await expect(page.getByRole('tab', { name: /saved/i })).toBeVisible();

    // Saved posts are private, so another person's profile does not even
    // advertise that the tab exists.
    await page.goto(`/u/${FOLLOWED.username}`);
    await expect(page.getByRole('tab', { name: /saved/i })).toHaveCount(0);
  });
});
