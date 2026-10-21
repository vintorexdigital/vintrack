import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/** Numbers in tables, KPIs and timers must line up: with tabular figures, "1111" and "8888" are the same width. */
test('the UI font is Inter and its tabular figures really are tabular', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  const r = await page.evaluate(async () => {
    await document.fonts.load('32px "Trackrex Figures"', '18');
    await document.fonts.ready;
    const measure = (text: string, tabular: boolean) => {
      const el = document.createElement('span');
      el.textContent = text;
      if (tabular) el.className = 'tabular-nums';
      el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:32px`;
      document.body.appendChild(el);
      const w = el.getBoundingClientRect().width;
      el.remove();
      return w;
    };
    return {
      family: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      tabular: [measure('1111', true), measure('8888', true)],
      proportional: [measure('1111', false), measure('8888', false)],
    };
  });
  console.log('font check', JSON.stringify(r));
  expect(r.family).toContain('Inter');
  expect(r.loaded.some((f) => f.includes('Inter'))).toBe(true);
  expect(r.loaded).toContain('Trackrex Figures');
  expect(Math.abs(r.tabular[0]! - r.tabular[1]!)).toBeLessThan(0.5);
  console.log('font check', JSON.stringify(r));
});
