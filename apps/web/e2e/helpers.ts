import type { Page } from '@playwright/test';

export const DEMO = { tenant: 'meridian-demo', password: 'Trackrex#2026' };

export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Company address').fill(DEMO.tenant);
  await page.getByLabel('Email or mobile number').fill(email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/', { timeout: 20_000 });
  await page.getByRole('main').waitFor();
}

/** The no-page-level-horizontal-scroll check from the device matrix. */
export async function noHorizontalScroll(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}

export const MATRIX: { name: string; width: number; height: number; zoom?: number }[] = [
  { name: '320x568', width: 320, height: 568 }, { name: '360x800', width: 360, height: 800 }, { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 }, { name: '844x390', width: 844, height: 390 }, { name: '915x412', width: 915, height: 412 },
  { name: '768x1024', width: 768, height: 1024 }, { name: '1024x768', width: 1024, height: 768 }, { name: '820x1180', width: 820, height: 1180 },
  { name: '1180x820', width: 1180, height: 820 }, { name: '1280x800', width: 1280, height: 800 }, { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 }, { name: '1920x1080', width: 1920, height: 1080 }, { name: '2560x1080', width: 2560, height: 1080 },
  { name: '3440x1440', width: 3440, height: 1440 }, { name: '5120x1440', width: 5120, height: 1440 }, { name: '3840x2160', width: 3840, height: 2160 },
  { name: '1280x800@200%', width: 640, height: 400, zoom: 2 },
];
