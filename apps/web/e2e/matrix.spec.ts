import { expect, test } from '@playwright/test';
import { MATRIX, noHorizontalScroll, signIn } from './helpers';

const ROUTES = ['/', '/attendance/register', '/people/employees', '/admin/time/shifts/new', '/admin/settings', '/leave/calendar', '/admin/security/roles', '/field/live', '/field/tasks', '/reports/dashboards', '/payroll/runs', '/helpdesk/tickets', '/onboarding/cases'];

test.describe('device matrix: no page-level horizontal scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, 'hr@meridian.test');
  });

  for (const vp of MATRIX) {
    test(`${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ROUTES) {
        await page.goto(route);
        await page.getByRole('main').waitFor();
        await page.waitForLoadState('networkidle');
        const m = await noHorizontalScroll(page);
        expect(m.scrollWidth, `${route} at ${vp.name} overflows (${m.scrollWidth} > ${m.innerWidth})`).toBeLessThanOrEqual(m.innerWidth);
      }
      await page.goto('/attendance/register');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `e2e/screenshots/matrix-register-${vp.name.replace('@', '-')}.png` });
    });
  }
});
