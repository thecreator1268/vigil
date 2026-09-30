import { expect, type Page } from '@playwright/test';

export async function skipOnboarding(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: 'Hello. How are you doing today?' })).toBeVisible();
}

/** Complete a check-in. `answers` are 0..4 per question, or 'skip'. */
export async function checkIn(page: Page, opts: { answers?: (number | 'skip')[]; text?: string } = {}) {
  const answers = opts.answers ?? [1, 3, 3, 3];
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Check in' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  for (const [i, a] of answers.entries()) {
    await expect(page.getByText(`Question ${i + 1} of ${answers.length}`)).toBeVisible();
    if (a === 'skip') await page.getByRole('button', { name: 'Skip this one' }).click();
    else await page.getByRole('radio').nth(a).check();
  }
  await expect(page.getByRole('heading', { name: "Is there anything you'd like to say?" })).toBeVisible();
  if (opts.text) {
    await page.getByRole('radio', { name: 'Write' }).click();
    await page.getByLabel('Your words').fill(opts.text);
  }
  await page.getByRole('button', { name: 'Save my check-in' }).click();
}

export async function signInAsStaff(page: Page, role: 'Counselor' | 'District / State admin') {
  await page.goto('/staff');
  await page.getByRole('button', { name: new RegExp(role) }).click();
}
