import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('owner sees leads and the call log', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/sales/leads');
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  await expect(page.getByRole('row', { name: /LEAD-/ }).first()).toBeVisible({ timeout: 15_000 });
  await page.goto('/field/calls');
  await expect(page.getByRole('heading', { name: 'Call log' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});
