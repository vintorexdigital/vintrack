import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const API = process.env.TRACKREX_API_URL ?? 'http://localhost:4000';
const PW = 'Trackrex#2026';
const json = { 'content-type': 'application/json', 'x-client': 'web' };
async function login(identifier: string) {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ identifier, password: PW, tenant: 'meridian-demo' }) });
  return ((await r.json()) as { accessToken: string }).accessToken;
}
const auth = (t: string) => ({ ...json, authorization: `Bearer ${t}` });

test('records the site in front while punched in, and nothing before', async () => {
  const owner = await login('owner@meridian.test');
  const hr = await login('employee@meridian.test');
  const me = (await (await fetch(`${API}/v1/auth/me`, { headers: auth(hr) })).json()) as { membership: { employeeId: string } };
  const employeeId = me.membership.employeeId;
  const state = async () => ((await (await fetch(`${API}/v1/attendance/status`, { headers: auth(hr) })).json()) as { state: string }).state;
  const wasIn = (await state()) === 'in';

  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'trk-ext-')), {
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: false,
    args: ['--no-sandbox', `--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    const id = new URL(sw.url()).host;
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByLabel('Company address').fill('meridian-demo');
    await popup.getByLabel('Email').fill('employee@meridian.test');
    await popup.getByLabel('Password').fill(PW);
    await popup.getByRole('button', { name: 'Sign in' }).click();
    await expect(popup.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15_000 });
    if (!wasIn) {
      await expect(popup.getByText('Not recording', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(popup.getByText(/not punched in/)).toBeVisible();
      // Punch in on the employee's behalf a little in the past, after any earlier punch, so the minute that just
      // ended is inside working time. If the latest punch is very recent, wait until that holds.
      const last = (await (await fetch(`${API}/v1/attendance/punches?employeeId=${employeeId}&limit=1`, { headers: auth(owner) })).json()) as { data: { at: string }[] };
      const lastAt = last.data[0] ? new Date(last.data[0].at).getTime() : 0;
      const at = Math.max(Date.now() - 10 * 60_000, lastAt + 1000);
      const wait = at + 70_000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const p = await fetch(`${API}/v1/attendance/punches`, { method: 'POST', headers: auth(owner), body: JSON.stringify({ employeeId, type: 'in', at: new Date(at).toISOString() }) });
      expect(p.status, await p.text()).toBe(201);
    }
    const send = (type: string) => popup.evaluate((t) => chrome.runtime.sendMessage({ type: t }), type);
    await send('refresh');
    await popup.reload();
    await expect(popup.getByText('● Recording')).toBeVisible({ timeout: 15_000 });

    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/sign-in');
    await page.bringToFront();
    const r = (await send('sample')) as { sent: boolean };
    expect(r.sent).toBe(true);
    await popup.reload();
    await expect(popup.getByText('localhost')).toBeVisible();

    const day = await (await fetch(`${API}/v1/productivity/day?employeeId=${employeeId}&date=${new Date().toISOString().slice(0, 10)}`, { headers: auth(owner) })).json() as { apps: { name: string; site: boolean }[] };
    expect(day.apps.some((a) => a.name === 'localhost' && a.site)).toBe(true);
  } finally {
    await ctx.close();
    if (!wasIn) await fetch(`${API}/v1/attendance/punches`, { method: 'POST', headers: auth(hr), body: JSON.stringify({ type: 'out' }) });
  }
});
