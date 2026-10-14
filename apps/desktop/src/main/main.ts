import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, powerMonitor } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, ApiError, OfflineQueue, type SignInResponse } from '@trackrex/client-core';
import { Agent, type AgentState } from '../agent/agent';
import { FileStore } from './stores';
import { focusedWindow, systemIdle } from './sources';

const here = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.TRACKREX_API_URL ?? 'http://localhost:4000';
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let signedIn = false;
let latest: AgentState | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const store = new FileStore(join(app.getPath('userData'), 'agent.json'));
const api = new ApiClient({ baseUrl: API_URL, store, newId: () => randomUUID(), client: 'desktop', onSessionLost: () => { signedIn = false; void agent.stop(); push(); } });
const queue = new OfflineQueue(store, () => randomUUID());
const agent = new Agent({ api, queue, windows: focusedWindow, idle: systemIdle, now: () => Date.now(), onState: (s) => { latest = s; push(); } });

function view() { return { signedIn, apiUrl: API_URL, agent: latest ?? agent.getState() }; }
function push() { win?.webContents.send('agent:state', view()); tray?.setToolTip(`Trackrex: ${(latest ?? agent.getState()).reason}`); }

function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 640, show: true, title: 'Trackrex Agent', icon: join(here, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void win.loadFile(join(here, '..', 'renderer', 'index.html'));
  // Closing the window hides it; the agent keeps running in the tray, which is also where the employee can see it.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win?.hide(); } });
}

let quitting = false;
app.on('before-quit', () => { quitting = true; });

async function start() {
  await queue.load();
  signedIn = await api.restore().catch(() => false);
  if (signedIn) await agent.refresh().catch(() => undefined);
  push();
}

app.whenReady().then(async () => {
  createWindow();
  tray = new Tray(nativeImage.createFromPath(join(here, '..', 'renderer', 'tray.png')));
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show Trackrex Agent', click: () => win?.show() }, { type: 'separator' }, { label: 'Quit', click: () => { void agent.stop().finally(() => app.quit()); } }]));
  tray.on('click', () => win?.show());
  await start();

  setInterval(() => { if (signedIn) void agent.tick().catch(() => undefined); }, 5_000);
  setInterval(() => { if (signedIn) void agent.refresh().catch(() => undefined); }, 60_000);
  setInterval(() => { if (signedIn) void agent.send().catch(() => undefined); }, 30_000);
  powerMonitor.on('lock-screen', () => void agent.send().catch(() => undefined));
});

ipcMain.handle('agent:state', () => view());
ipcMain.handle('agent:sign-in', async (_e, v: { tenant: string; identifier: string; password: string }) => {
  try {
    const r = await api.post<SignInResponse>('/v1/auth/login', { identifier: v.identifier, password: v.password, tenant: v.tenant }, { auth: false });
    if (r.status !== 'ok') return { ok: false, message: 'This account belongs to several companies. Enter the company address to choose one.' };
    await api.setSession({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    signedIn = true;
    await agent.refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : 'Could not reach the server.' };
  }
});
ipcMain.handle('agent:sign-out', async () => { await agent.stop(); await api.clearSession(); signedIn = false; push(); });

app.on('window-all-closed', () => { /* stay in the tray */ });
