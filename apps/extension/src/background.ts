import { api, boot, queue, sampler } from './runtime';

const ALARM = 'trackrex-minute';
chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create(ALARM, { periodInMinutes: 1 }); });
chrome.runtime.onStartup.addListener(() => { void chrome.alarms.create(ALARM, { periodInMinutes: 1 }); });

let tickCount = 0;
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM) return;
  void (async () => {
    if (!(await boot())) return;
    if (++tickCount % 5 === 0) await sampler.refresh().catch(() => undefined);
    await sampler.sample();
    await queue.flush(api).catch(() => undefined);
  })();
});

// The popup asks the worker for state and to sign in; nothing else can message it.
chrome.runtime.onMessage.addListener((msg: { type: string; tenant?: string; identifier?: string; password?: string }, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  void (async () => {
    await boot();
    if (msg.type === 'state') return reply({ signedIn: api.signedIn, state: sampler.getState(), queued: queue.size });
    if (msg.type === 'refresh') { await sampler.refresh().catch(() => undefined); return reply({ signedIn: api.signedIn, state: sampler.getState(), queued: queue.size }); }
    if (msg.type === 'sample') { const sent = await sampler.sample(); return reply({ sent, state: sampler.getState() }); }
    if (msg.type === 'sign-in') {
      try {
        const r = await api.post<{ status: string; accessToken?: string; refreshToken?: string }>('/v1/auth/login', { identifier: msg.identifier, password: msg.password, tenant: msg.tenant }, { auth: false });
        if (r.status !== 'ok' || !r.accessToken || !r.refreshToken) return reply({ ok: false, message: 'Enter your company address to choose a company.' });
        await api.setSession({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        await sampler.refresh();
        return reply({ ok: true });
      } catch (e) { return reply({ ok: false, message: e instanceof Error ? e.message : 'Could not sign in.' }); }
    }
    if (msg.type === 'sign-out') { await api.clearSession(); return reply({ ok: true }); }
    return reply({ ok: false });
  })();
  return true;
});
