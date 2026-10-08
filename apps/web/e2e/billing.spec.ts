import { expect, test } from '@playwright/test';
import { createTrialCompany, noHorizontalScroll, signInAs } from './helpers';

test('a trial company chooses a plan and sees its first invoice', async ({ page, request }) => {
  const co = await createTrialCompany(request);
  await signInAs(page, co.slug, co.email);
  await page.goto('/admin/billing');
  await expect(page.getByRole('heading', { name: 'Plan and billing' })).toBeVisible();
  await expect(page.getByText(/free trial/i)).toBeVisible();
  await page.getByRole('button', { name: 'Choose a plan' }).click();
  await page.getByRole('radio', { name: /Field/ }).check();
  await page.getByRole('spinbutton', { name: /Seats/ }).fill('8');
  await page.getByRole('button', { name: 'Create invoice' }).click();
  const row = page.getByRole('row', { name: /INV-/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('open')).toBeVisible();
  await expect(row.getByText(/₹/)).toBeVisible();
  await row.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByText(/bank transfer/i)).toBeVisible();
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});
