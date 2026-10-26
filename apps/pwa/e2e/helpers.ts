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
  // The "before you start" disclosure only shows the first time on a device —
  // skip the click if a prior check-in in this test already passed it.
  //
  // locator.isVisible() does NOT wait — Playwright's own docs for it say so
  // verbatim ("does not wait for the element to become visible and returns
  // immediately"). Checked right after the nav click, it can read `false`
  // before the client-side route has rendered anything yet, which this code
  // used to read as "disclosure already seen" and skip clicking Start —
  // stranding the flow on the disclosure step forever, since Start is the
  // only way off it. "Question 1 of N" (asserted in the loop below) then
  // never appears, and the test times out on that assertion instead of here
  // — this is what failed on main in CI run #12 (commit 27508fb), on every
  // test that calls checkIn(), and only those. Waiting on the real state
  // (either element actually on screen) before branching removes the race.
  const start = page.getByRole('button', { name: 'Start' });
  const firstQuestion = page.getByText(`Question 1 of ${answers.length}`);
  await expect(start.or(firstQuestion)).toBeVisible();
  if (await start.isVisible()) await start.click();
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
