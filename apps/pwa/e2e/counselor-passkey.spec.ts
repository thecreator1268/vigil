import { expect, test } from '@playwright/test';
import { bootstrapCounselor } from './ops-cli';

// Playwright's virtual WebAuthn authenticator (context.credentials) answers
// navigator.credentials.create()/get() for real — no mocked JS, no real
// hardware. The enrollment token comes from the REAL ops CLI running inside
// the container (docker compose exec), exercising the actual bootstrap path
// an operator would use, not a shortcut around it.
test('a brand-new counselor registers a real passkey via an enrollment token, then signs in usernameless and reaches the alert queue', async ({ page, context }) => {
  await context.credentials.install();
  const counselorId = `c_e2e_${Date.now()}`;
  const enrollmentToken = bootstrapCounselor(counselorId);

  await page.goto('/staff');
  await page.getByText('Have an enrollment link from your administrator?').click();
  await page.getByLabel('Enrollment token').fill(enrollmentToken);
  await page.getByRole('button', { name: 'Register this device as a passkey' }).click();
  await expect(page.getByText('Your passkey is registered.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
});

test('with no seeded credential, a passkey sign-in attempt fails calmly rather than silently succeeding', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.credentials.install(); // installed, but holds no credentials at all
  const page = await ctx.newPage();
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('alert')).toHaveText('Sign-in is unavailable. Check your connection and try again.');
  await expect(page).toHaveURL(/\/staff$/); // never navigated to /counselor
  await ctx.close();
});
