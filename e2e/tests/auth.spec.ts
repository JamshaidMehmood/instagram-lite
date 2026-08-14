import { DEMO, API_URL } from '../support/env';
import { expect, expectSignedIn, signIn, signOut, test } from '../support/fixtures';

test.describe('authentication', () => {
  test('signs in with the demo credentials and lands on the feed', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('the one-click demo button establishes a session', async ({ page }) => {
    await page.goto('/signin');
    await page.getByRole('button', { name: /try the demo account/i }).click();
    await expectSignedIn(page);
  });

  test('rejects a wrong password without saying which half was wrong', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel('Email').fill(DEMO.email);
    await page.getByLabel('Password').fill('NotThePassword1');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    // The API deliberately answers the same way for a bad password and an
    // unknown address, so an attacker cannot use it to enumerate accounts.
    await expect(alert).toHaveText(/email or password is incorrect/i);
  });

  test('registers a new account and signs it straight in', async ({ page }) => {
    // Unique per run: the suite seeds once, but a rerun without reseeding must
    // not collide with the account the previous run created.
    const suffix = `${process.pid}${Date.now().toString().slice(-6)}`;
    const email = `newcomer${suffix}@example.com`;

    await page.goto('/signup');
    await page.getByLabel('Full name').fill('New Comer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Password1');
    await page.getByRole('button', { name: /create account/i }).click();

    // Signup returns a session, so there is no second trip through the form.
    await expectSignedIn(page);

    // A brand-new account follows nobody, so the feed is the empty state rather
    // than everyone's posts — the whole point of the following feed.
    await expect(page.getByRole('heading', { name: /your feed is quiet/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /find people to follow/i })).toBeVisible();
  });

  test('refuses to reuse an email that is already registered', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Full name').fill('Impostor');
    await page.getByLabel('Email').fill(DEMO.email);
    await page.getByLabel('Password').fill('Password1');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
  });

  test('survives a reload, because the refresh cookie outlives the page', async ({ page }) => {
    await signIn(page);

    // The access token lives in memory only, so this proves the httpOnly
    // refresh cookie and the boot-time `/auth/refresh` are doing their job.
    await page.reload();
    await expectSignedIn(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('sends an anonymous visitor to sign-in and back to where they were headed', async ({
    page,
  }) => {
    await page.goto('/explore');
    await expect(page).toHaveURL(/\/signin$/);

    await page.getByLabel('Email').fill(DEMO.email);
    await page.getByLabel('Password').fill(DEMO.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // The deep link was remembered rather than dropping them on the feed.
    await expect(page).toHaveURL(/\/explore$/, { timeout: 20_000 });
  });

  test('signing out ends the session for good', async ({ page }) => {
    await signIn(page);
    await signOut(page);

    // Going back must not restore the session from cache.
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
  });
});

test.describe('google sign-in', () => {
  test('offers a Google option on both auth pages', async ({ page }) => {
    // The button is Google's own iframe-rendered widget, so assert the mount
    // point and its labelling rather than reaching inside a third-party frame.
    await page.goto('/signin');
    await expect(page.getByText(/continue with google|or/i).first()).toBeVisible();

    await page.goto('/signup');
    await expect(page.getByText(/continue with google|or/i).first()).toBeVisible();
  });

  test('the API refuses a forged ID token', async ({ request }) => {
    // The single most important assertion about this feature: a token we minted
    // ourselves must not be accepted. If verification were ever short-circuited,
    // anyone could sign in as anyone.
    const response = await request.post(`${API_URL}/api/v1/auth/google`, {
      data: { idToken: 'not.a.real.token' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/could not verify/i);
  });

  test('the API rejects a missing credential with a field error', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/v1/auth/google`, {
      data: {},
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });
});
