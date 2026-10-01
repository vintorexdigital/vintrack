import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('manager signs in, sees today, opens the register and a CRUD list', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('Present today')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/home-1440.png' });

  await page.goto('/attendance/register');
  await expect(page.getByRole('heading', { name: 'Monthly register' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/register-1440.png' });

  await page.goto('/admin/organization/departments');
  await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible();
  await expect(page.getByRole('table').getByText('Sales')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/departments-1440.png' });
});
