import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers';

test('device-safety notice shows once before onboarding, then never again', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();
  await expect(page.getByTestId('crisis-bar')).toBeVisible(); // never hidden, not even here
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `notice: ${v.id} — ${v.help}`)).toEqual([]);
  await page.getByRole('button', { name: 'I understand — continue' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();

  await page.reload();
  await expect(page).not.toHaveURL(/welcome/);
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { name: 'Before we begin' })).not.toBeVisible();
});

test('install-time notice: surfaces on the real beforeinstallprompt event, passes axe, and dismissing never blocks the install itself', async ({ page }) => {
  await skipOnboarding(page);

  // Simulate the browser offering to install, exactly as Chrome does.
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
    (window as unknown as { __installPrompted?: boolean }).__installPrompted = false;
    event.prompt = () => {
      (window as unknown as { __installPrompted: boolean }).__installPrompted = true;
      return Promise.resolve();
    };
    window.dispatchEvent(event);
  });

  await expect(page.getByRole('heading', { name: 'Installing this app' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `install notice: ${v.id} — ${v.help}`)).toEqual([]);

  // "Install" still calls the real deferred prompt — dismissing our own
  // banner never stands in the way of actually installing.
  await page.getByRole('button', { name: 'Install' }).click();
  expect(await page.evaluate(() => (window as unknown as { __installPrompted: boolean }).__installPrompted)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Installing this app' })).not.toBeVisible();
});

test('App Lock is off by default; turning it on locks the app on resume, and the crisis bar stays reachable while locked', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'App Lock' })).toBeVisible();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Turn on App Lock' }).click();
  await page.getByLabel('PIN', { exact: true }).fill('4321');
  await page.getByLabel('Enter the same PIN again').fill('4321');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();

  // Simulate the app resuming from the background.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
  await expect(page.getByTestId('crisis-bar')).toBeVisible();
  await expect(page.getByTestId('crisis-bar').getByRole('link', { name: /KIRAN 1800-599-0019/ })).toHaveAttribute('href', 'tel:18005990019');
  const lockResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(lockResults.violations.map((v) => `locked: ${v.id} — ${v.help}`)).toEqual([]);

  await page.getByLabel('PIN').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText("That's not right. Try again.")).toBeVisible();

  await page.getByLabel('PIN').fill('4321');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // /help bypasses the lock entirely, even without unlocking first.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'KIRAN Mental Health Helpline' })).toBeVisible();
});

test('Quick Wipe clears every local storage mechanism, not just the check-in data', async ({ page }) => {
  await skipOnboarding(page);
  await page.evaluate(async () => {
    localStorage.setItem('probe', '1');
    sessionStorage.setItem('probe', '1');
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length))
    .toBeGreaterThan(0); // the service worker has precached the app shell by now

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Erase everything' }).click();
  await page.getByLabel('Type ERASE to confirm').fill('ERASE');
  await page.getByRole('button', { name: 'Yes, erase everything' }).click();
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();

  const after = await page.evaluate(async () => ({
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
    swRegistrations: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  // localStorage/sessionStorage have no legitimate reason to repopulate.
  expect(after.localStorageLength).toBe(0);
  expect(after.sessionStorageLength).toBe(0);
  // The service worker re-registering after the reload is correct — the app
  // still needs to work offline — so a fresh registration (and a fresh
  // precache of the same non-personal static assets) is expected, not a
  // leftover. What matters is no *duplicate* piled up across the wipe.
  // The exact pre-reload clear (old registration unregistered, old caches
  // deleted) is asserted deterministically in wipe.test.ts, where a stubbed
  // `reload` lets the test observe state before navigation races it away.
  expect(after.swRegistrations).toBe(1);
});
