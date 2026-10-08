import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = process.env.TRACKREX_API_URL ?? 'http://localhost:4000';
const login = async () => {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'web' }, body: JSON.stringify({ identifier: 'hr@meridian.test', password: 'Trackrex#2026', tenant: 'meridian-demo' }) });
  return ((await r.json()) as { accessToken: string }).accessToken;
};
const status = async (t: string) => ((await (await fetch(`${API}/v1/attendance/status`, { headers: { authorization: `Bearer ${t}` } })).json()) as { state: string }).state;
const punch = (t: string, type: 'in' | 'out') => fetch(`${API}/v1/attendance/punches`, { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', 'x-client': 'web' }, body: JSON.stringify({ type }) });

test('signs in, shows what is collected, and records only while punched in', async () => {
  const token = await login();
  const startedIn = (await status(token)) === 'in';
  if (startedIn) await punch(token, 'out');

  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trk-'))}`], env: { ...process.env, TRACKREX_API_URL: API } });
  try {
    const win = await app.firstWindow();
    await win.getByLabel('Company address').fill('meridian-demo');
    await win.getByLabel('Email').fill('hr@meridian.test');
    await win.getByLabel('Password').fill('Trackrex#2026');
    await win.getByRole('button', { name: 'Sign in' }).click();
    await expect(win.getByText('Not recording', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(win.getByText(/you are not punched in/)).toBeVisible();
    await expect(win.getByText('Screenshots: never')).toBeVisible();
    await expect(win.getByText('Window titles: not collected')).toBeVisible();
    await expect(win.getByText('Only between punch in and punch out')).toBeVisible();
  } finally {
    await app.close();
    if (startedIn) await punch(token, 'in');
  }
});

test('shows recording once punched in', async () => {
  const token = await login();
  const startedIn = (await status(token)) === 'in';
  if (!startedIn) {
    const p = await punch(token, 'in');
    expect(p.status, await p.text()).toBe(201);
  }
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trk-'))}`], env: { ...process.env, TRACKREX_API_URL: API } });
  try {
    const win = await app.firstWindow();
    await win.getByLabel('Company address').fill('meridian-demo');
    await win.getByLabel('Email').fill('hr@meridian.test');
    await win.getByLabel('Password').fill('Trackrex#2026');
    await win.getByRole('button', { name: 'Sign in' }).click();
    await expect(win.getByText('● Recording')).toBeVisible({ timeout: 15_000 });
    await win.getByRole('button', { name: 'Sign out' }).click();
    await expect(win.getByRole('button', { name: 'Sign in' })).toBeVisible();
  } finally {
    await app.close();
    if (!startedIn) await punch(token, 'out');
  }
});
