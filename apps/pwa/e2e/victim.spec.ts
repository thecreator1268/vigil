import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { checkIn, skipOnboarding } from './helpers';

test('the crisis bar is visible on every screen, including onboarding', async ({ page }) => {
  await page.goto('/');
  for (const path of ['/welcome', '/help', '/staff']) {
    await page.goto(path);
    const bar = page.getByTestId('crisis-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: /KIRAN 1800-599-0019/ })).toHaveAttribute('href', 'tel:18005990019');
  }
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'KIRAN Mental Health Helpline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iCall' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vandrevala Foundation Helpline' })).toBeVisible();
});

test('onboarding plays once, then a check-in is saved on the device and syncs', async ({ page }) => {
  await skipOnboarding(page);
  await page.reload();
  await expect(page).not.toHaveURL(/welcome/); // plays once only

  await checkIn(page, { answers: [1, 'skip', 3, 3] });
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/spinner|loading…/i);

  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My entries' }).click();
  await expect(page.getByText('Synced').first()).toBeVisible({ timeout: 20_000 });
  // No score is ever shown to the person.
  await expect(page.locator('main')).not.toContainText(/score|composite|\b0\.\d+/i);
});

test('offline: the check-in completes locally, then syncs when the connection returns', async ({ page, context }) => {
  await skipOnboarding(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/You're offline/)).toBeVisible();

  await checkIn(page, { answers: [3, 1, 1, 1] });
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My entries' }).click();
  await expect(page.getByText('Saved on this device').first()).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Synced').first()).toBeVisible({ timeout: 30_000 });
});

test('offline reload: the service worker serves the app shell', async ({ page, context }) => {
  await skipOnboarding(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // let the SW take control
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('crisis-bar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hello. How are you doing today?' })).toBeVisible();
  await context.setOffline(false);
});

test('every question can be skipped and the words stay erasable by their author', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sharing' }).click();
  await page.getByRole('switch', { name: 'Share what I write' }).click();
  await expect(page.getByText('Turned on: Share what I write')).toBeVisible();

  await checkIn(page, { answers: ['skip', 'skip', 'skip', 'skip'], text: 'Today I went for a walk with my sister.' });
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My entries' }).click();
  await page.getByRole('button', { name: 'What you wrote' }).first().click();
  await expect(page.getByText('Today I went for a walk with my sister.')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Erase what I wrote' }).click();
  await expect(page.getByText('Erased.')).toBeVisible();
});

test('Hindi: all victim copy switches language', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Switch language to Hindi' }).click();
  await expect(page.getByRole('heading', { name: 'नमस्ते। आज आप कैसे हैं?' })).toBeVisible();
  await expect(page.getByTestId('crisis-bar')).toContainText('KIRAN');
});

test('WCAG 2.1 AA: no axe violations on victim screens', async ({ page }) => {
  await skipOnboarding(page);
  for (const path of ['/', '/help', '/sharing', '/checkin']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${path}: ${v.id} — ${v.help}`)).toEqual([]);
  }
});
