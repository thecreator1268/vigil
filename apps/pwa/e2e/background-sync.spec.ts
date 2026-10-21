import { expect, test } from '@playwright/test';
import { checkIn, skipOnboarding } from './helpers';

test('a check-in saved while offline registers a real Background Sync tag', async ({ page, context }) => {
  await skipOnboarding(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await checkIn(page, { answers: [1, 1, 1, 1] });
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible();

  const tags = await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { getTags(): Promise<string[]> };
    };
    return registration.sync ? registration.sync.getTags() : null;
  });
  expect(tags).toContain('vigil-sync');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
});
