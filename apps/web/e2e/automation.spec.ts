import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('admin sees the seeded workflows and edits steps in the builder', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/admin/automation/workflows');
  await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
  await expect(page.getByRole('table').getByText('Large expense review')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Add workflow|New workflow/ }).click();
  await page.getByLabel('Name').fill('E2E welcome note');
  await page.getByLabel('When').selectOption({ label: 'A lead is assigned' });
  await page.getByRole('button', { name: 'Send a notification' }).click();
  await expect(page.getByText('1. Send a notification')).toBeVisible();
  await page.getByLabel(/^Title/).first().fill('New lead: {{payload.title}}');
  await page.getByRole('button', { name: 'Wait' }).click();
  await expect(page.getByText('2. Wait')).toBeVisible();
  await page.getByRole('button', { name: 'Create workflow' }).click();
  await page.waitForURL(/\/admin\/automation\/workflows(\/|$)/);
  await page.goto('/admin/automation/workflows');
  await expect(page.getByRole('table').getByText('E2E welcome note')).toBeVisible();
});

test('the approvals inbox is there for everyone and empty when nothing is asked', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await expect(page.getByText('Nothing waiting for you')).toBeVisible();
});

test('admin sees the message log with the mock-provider notice, and the encryption card', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/admin/security/messages');
  await expect(page.getByRole('heading', { name: 'Message log' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('mock provider');
  await page.goto('/admin/company');
  await expect(page.getByRole('heading', { name: 'Encryption' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Key service:/)).toBeVisible();
});
