import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { checkIn, signInAsStaff, skipOnboarding } from './helpers';

test('crisis fast-path: calm confirmation for the person → urgent alert for the counselor', async ({ browser }) => {
  const words = `I do not want to live anymore (${Date.now()})`;

  // The person
  const victimCtx = await browser.newContext();
  const victim = await victimCtx.newPage();
  await skipOnboarding(victim);
  await checkIn(victim, { answers: [4, 0, 0, 0], text: words });
  await expect(victim.getByText("We've flagged this for a counselor to review. Someone will reach out to you.")).toBeVisible();
  await expect(victim.getByRole('link', { name: /Call 1800-599-0019/ })).toBeVisible();
  await expect(victim.locator('main')).not.toContainText(/alert|emergency detected|score/i);
  await victimCtx.close();

  // The counselor
  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await signInAsStaff(staff, 'Counselor');
  await expect(staff.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  const card = staff.getByRole('listitem').filter({ hasText: 'v_demo_0001' }).filter({ hasText: /harming themselves/ }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('Urgent')).toBeVisible();
  await expect(card).not.toContainText(/raw_score|\b0\.\d+/);

  await card.getByRole('button', { name: /Open details/ }).click();
  await expect(staff.getByRole('heading', { name: 'What they told us' })).toBeVisible();
  await expect(staff.getByText(words)).toBeVisible();
  await expect(staff.getByRole('heading', { name: "Compared with what's usual for them" })).toBeVisible();

  const results = await new AxeBuilder({ page: staff }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id} — ${v.help}`)).toEqual([]);

  await staff.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(staff.getByText(/Acknowledged by c_demo_01/)).toBeVisible();
  await staffCtx.close();
});

test('RBAC: a counselor token is refused on /v1/admin/* at the gateway', async ({ page }) => {
  await signInAsStaff(page, 'Counselor');
  const token = await page.evaluate(async () => {
    const res = await fetch('/auth/dev-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"role":"counselor"}' });
    return (await res.json()).access_token as string;
  });
  const res = await page.request.get('/v1/admin/rollups?region=pune', { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(403);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/staff\?next=%2Fadmin/);
});

test('admin sees anonymized aggregates only', async ({ page }) => {
  await signInAsStaff(page, 'District / State admin');
  await expect(page.getByRole('heading', { name: 'Regional overview' })).toBeVisible();
  await page.getByLabel('District').selectOption('nashik');
  await expect(page.getByText(/figures are hidden to protect their privacy/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/v_[a-z0-9_]{6,}/i);
});
