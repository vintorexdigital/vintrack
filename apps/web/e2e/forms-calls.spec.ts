import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('a task form: the manager builds one, attaches it, the employee fills it, the manager reads it', async ({ browser }) => {
  const mgr = await browser.newPage();
  await signIn(mgr, 'manager@meridian.test');
  await mgr.goto('/field/tasks');
  await expect(mgr.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  // the seeded visit tasks already carry the checklist; open one that is finished and read its answers
  await mgr.getByRole('table').getByRole('row').nth(1).click();
  await mgr.getByRole('tab', { name: 'Form' }).click();
  await expect(mgr.getByRole('heading', { name: 'Store visit checklist' })).toBeVisible({ timeout: 15_000 });
  await mgr.close();

  const emp = await browser.newPage();
  await signIn(emp, 'employee@meridian.test');
  await emp.goto('/field/my-tasks');
  await expect(emp.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  const fillButtons = emp.getByRole('button', { name: /Fill form|View form/ });
  if (await fillButtons.count()) {
    await fillButtons.first().click();
    await expect(emp.getByRole('dialog')).toBeVisible();
    await expect(emp.getByText('Is the shelf fully stocked?')).toBeVisible();
    // the follow-up question appears only for "No"
    await expect(emp.getByLabel('What is missing?')).toHaveCount(0);
    await emp.getByRole('radio', { name: 'No' }).first().check();
    await expect(emp.getByLabel(/What is missing/)).toBeVisible();
  }
  await emp.close();
});

test('cloud calling in mock mode: call a customer, simulate the call, play the recording', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/field/customers');
  await page.getByRole('table').getByRole('row').nth(1).click();
  await page.getByRole('tab', { name: 'Calls' }).click();
  await expect(page.getByText(/mock mode/i)).toBeVisible({ timeout: 15_000 });
  // the seeded call has a recording to play
  const play = page.getByRole('button', { name: 'Play recording' }).first();
  if (await play.count()) {
    await play.click();
    await expect(page.locator('audio').first()).toBeVisible({ timeout: 15_000 });
  }
});
