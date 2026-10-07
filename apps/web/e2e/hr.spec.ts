import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('payroll: last month is paid and the run shows payslips and totals', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/payroll/runs');
  await expect(page.getByRole('heading', { name: 'Payroll' })).toBeVisible();
  const row = page.getByRole('table', { name: 'Payroll runs' }).getByRole('row').nth(1);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('paid');
  await row.getByRole('link').click();
  await expect(page.getByRole('heading', { name: /Payroll for/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Payslips in this run' }).getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByText(/Tax deducted at source is not calculated/)).toBeVisible();
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('an employee sees only their own payslip and cannot open payroll', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.goto('/me/payslips');
  await expect(page.getByRole('heading', { name: 'My payslips' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'My payslips' }).getByRole('row')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Payroll runs' })).toHaveCount(0);
});

test('checklists: HR sees the running joiner checklist and ticks a step', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/onboarding/cases');
  await expect(page.getByRole('heading', { name: 'Checklists' })).toBeVisible();
  await page.getByRole('table', { name: 'Checklists' }).getByRole('link').first().click();
  const step = page.getByRole('checkbox', { name: 'Collect ID and bank details' });
  await expect(step).toBeVisible({ timeout: 15_000 });
  if (!(await step.isChecked())) await step.click(); // saved on the server, then the list refreshes
  await expect(step).toBeChecked({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Collect ID and bank details' })).toBeChecked({ timeout: 15_000 });
});

test('help desk: an employee raises a request, the desk replies, and the employee sees it', async ({ browser }) => {
  const emp = await browser.newPage();
  await signIn(emp, 'employee@meridian.test');
  await emp.goto('/helpdesk/tickets/new');
  await emp.getByLabel('What do you need?').fill('E2E: second monitor please');
  await emp.getByLabel('Details').fill('My current one flickers.');
  await emp.getByRole('button', { name: 'Send request' }).click();
  await emp.waitForURL(/\/helpdesk\/tickets\/[0-9a-f-]{36}/);
  await expect(emp.getByRole('heading', { name: /E2E: second monitor please/ })).toBeVisible();
  const url = emp.url();

  const hr = await browser.newPage();
  await signIn(hr, 'hr@meridian.test');
  await hr.goto(url);
  await hr.getByLabel('Reply').fill('Ordered. It arrives Friday.');
  await hr.getByRole('button', { name: 'Send reply' }).click();
  await expect(hr.getByText('Ordered. It arrives Friday.')).toBeVisible({ timeout: 15_000 });
  await hr.getByLabel('Status').selectOption('resolved');
  await expect(hr.getByText('Resolved').first()).toBeVisible({ timeout: 15_000 });

  await emp.reload();
  await expect(emp.getByText('Ordered. It arrives Friday.')).toBeVisible({ timeout: 15_000 });
  await expect(emp.getByRole('button', { name: 'It is fixed, close it' })).toBeVisible();
  await hr.close(); await emp.close();
});

test('assets: the desk sees the list and the holder sees their equipment', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/helpdesk/assets');
  await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
  await expect(page.getByRole('table').getByText('ThinkPad T14').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('table').getByText('ThinkPad T14').first().click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});
