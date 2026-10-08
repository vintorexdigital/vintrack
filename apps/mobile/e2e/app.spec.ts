import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Company address').fill('meridian-demo');
  await page.getByLabel('Email or mobile number').fill('employee@meridian.test');
  await page.getByLabel('Password').fill('Trackrex#2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/Punched in|Not punched in/)).toBeVisible({ timeout: 20_000 });
}

/** Taps Punch and, when the shift needs a selfie, takes one with the browser's fake camera. */
async function tapPunch(page: Page) {
  await punchButton(page).click();
  const photo = page.getByRole('button', { name: 'Take photo' });
  await photo.waitFor({ timeout: 4000 }).then(async () => { await expect(photo).toBeEnabled({ timeout: 10_000 }); await photo.click(); }).catch(() => undefined);
}

const punchButton = (page: Page) => page.getByRole('button', { name: /^Punch (in|out)$/ });
// The punch button stays disabled until the phone knows the current state, so wait for it.

test('signs in and shows today', async ({ page }) => {
  await signIn(page);
  await expect(punchButton(page)).toBeVisible();
  const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  expect(m.s).toBeLessThanOrEqual(m.i);
});

test('wrong password is explained, not a blank failure', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Company address').fill('meridian-demo');
  await page.getByLabel('Email or mobile number').fill('employee@meridian.test');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('punching offline keeps it on the phone and sends it once the network is back', async ({ page, context }) => {
  await signIn(page);
  await expect(punchButton(page)).toBeEnabled({ timeout: 15_000 });
  const before = await page.getByText(/^(Punched in|Not punched in)$/).innerText();
  await context.setOffline(true);
  await tapPunch(page);
  await expect(page.getByText(/Saved on this phone/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/items? (is|are) saved on this phone/)).toBeVisible();
  await expect(page.getByText(before === 'Punched in' ? 'Not punched in' : 'Punched in', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByText(/saved on this phone and will be sent/)).toHaveCount(0, { timeout: 20_000 });
  // put the demo account back the way it was
  await tapPunch(page);
  await expect(page.getByText(before, { exact: true })).toBeVisible({ timeout: 20_000 });
});

test('tasks tab lists assigned work', async ({ page }) => {
  await signIn(page);
  await page.getByRole('tab', { name: /Tasks/ }).click();
  await expect(page.getByText(/Nothing assigned|Start and check in|Complete/).first()).toBeVisible({ timeout: 15_000 });
});
