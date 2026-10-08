import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExpoPushMessaging, MockChannelProvider, TwilioMessaging } from '../src/shared/providers/messaging/channels.js';
import { ChannelRouter } from '../src/shared/providers/messaging/channels.js';
import { render, SMS_LIMIT } from '../src/modules/notifications/delivery.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, type Harness } from './harness.js';
import { world, type World } from './fixtures.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const stub = (status: number, body: unknown) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fn, calls };
};

describe('provider adapters (stubbed fetch, never run against the live services)', () => {
  it('Twilio: sends SMS and WhatsApp with basic auth and whatsapp: prefixes, and reports refusals', async () => {
    const ok = stub(201, { sid: 'SM123' });
    const t = new TwilioMessaging({ accountSid: 'AC1', authToken: 'tok', smsFrom: '+15550001', whatsappFrom: '+15550002' }, ok.fn);
    expect(await t.send({ channel: 'sms', to: '+919876543210', template: 'n', body: 'hello' })).toEqual({ providerId: 'SM123' });
    expect(ok.calls[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    expect((ok.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('AC1:tok').toString('base64')}`);
    expect(new URLSearchParams(ok.calls[0]!.init.body as string).get('To')).toBe('+919876543210');
    await t.send({ channel: 'whatsapp', to: '+919876543210', template: 'n', body: 'hi' });
    const wa = new URLSearchParams(ok.calls[1]!.init.body as string);
    expect(wa.get('To')).toBe('whatsapp:+919876543210');
    expect(wa.get('From')).toBe('whatsapp:+15550002');
    const bad = new TwilioMessaging({ accountSid: 'AC1', authToken: 'tok', smsFrom: '+1' }, stub(400, { message: 'Invalid To number' }).fn);
    await expect(bad.send({ channel: 'sms', to: 'x', template: 'n', body: 'b' })).rejects.toThrow(/Invalid To number/);
    await expect(bad.send({ channel: 'whatsapp', to: 'x', template: 'n', body: 'b' })).rejects.toThrow(/No whatsapp sender/);
    await expect(bad.send({ channel: 'push', to: 'x', template: 'n', body: 'b' })).rejects.toThrow(/does not carry/);
  });

  it('Expo: sends push with title, body and link data, and surfaces unregistered devices', async () => {
    const ok = stub(200, { data: { status: 'ok', id: 'tk-1' } });
    const p = new ExpoPushMessaging('exp-token', ok.fn);
    expect(await p.send({ channel: 'push', to: 'ExponentPushToken[abc]', template: 'n', subject: 'Title', body: 'Body', vars: { link: '/x' } })).toEqual({ providerId: 'tk-1' });
    expect(JSON.parse(ok.calls[0]!.init.body as string)).toMatchObject({ to: 'ExponentPushToken[abc]', title: 'Title', body: 'Body', data: { link: '/x' } });
    const gone = new ExpoPushMessaging(undefined, stub(200, { data: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } }).fn);
    await expect(gone.send({ channel: 'push', to: 't', template: 'n', body: 'b' })).rejects.toThrow(/DeviceNotRegistered/);
  });

  it('mock provider records messages, delivers nothing, and can simulate a rejection', async () => {
    const m = new MockChannelProvider('sms');
    expect((await m.send({ channel: 'sms', to: '+919876543210', template: 'n', body: 'b' })).providerId).toMatch(/^mock-sms-1-/);
    expect(m.sent).toHaveLength(1);
    await expect(m.send({ channel: 'sms', to: '+910000000000', template: 'n', body: 'b' })).rejects.toThrow(/simulated failure/);
    const router = new ChannelRouter({ email: m, sms: m, whatsapp: m, push: m });
    expect(router.isMock('sms')).toBe(true);
  });

  it('renders one short SMS segment, a WhatsApp template and a push with a link', () => {
    const long = { title: 'Priya Nair applied for leave', body: 'x'.repeat(300), link: '/leave/requests' };
    expect(render('sms', long, 'https://app.test').body.length).toBeLessThanOrEqual(SMS_LIMIT);
    expect(render('whatsapp', long, 'https://app.test')).toMatchObject({ template: 'trackrex_notification', vars: { url: 'https://app.test/leave/requests' } });
    expect(render('push', long, 'https://app.test')).toMatchObject({ subject: 'Priya Nair applied for leave', vars: { link: '/leave/requests' } });
  });
});

function future(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !['01-01', '01-26', '05-01', '08-15', '10-02', '12-25'].includes(iso.slice(5))) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

describe('multi-channel delivery of notifications', () => {
  it('sends to the channels a person chose, logs each attempt, and skips channels without a contact or an opt-in', async () => {
    const mgr = await w.employee('Chan Manager', { mobile: '+919812300001' });
    const emp = await w.employee('Chan Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const lop = (await h.api.get('/v1/leave/types').set(s.auth)).body.data.find((t: { code: string }) => t.code === 'LOP');
    const jobs = h.app.get(JobsService);
    const router = h.app.get(ChannelRouter);
    const sms = router.providers.sms as MockChannelProvider;
    const wa = router.providers.whatsapp as MockChannelProvider;
    const push = router.providers.push as MockChannelProvider;
    const apply = (d: string) => h.api.post('/v1/leave/requests').set(s.auth).send({ employeeId: emp.id, leaveTypeId: lop.id, fromDate: d, toDate: d });

    // defaults: email on, push on (no device yet), SMS and WhatsApp are opt-in
    const prefs = (await h.api.get('/v1/notifications/preferences').set(m.auth)).body;
    expect(prefs).toMatchObject({ sms: false, whatsapp: false, push: true, hasMobile: true, pushDevices: 0 });
    expect(prefs.providers.sms).toMatchObject({ mock: true, name: 'mock-sms' });
    await apply(future(40));
    await jobs.run('outbox-relay');
    expect(sms.sent.filter((x) => x.to === '+919812300001')).toHaveLength(0);

    // opt in to everything and register a device
    await h.api.put('/v1/notifications/preferences').set(m.auth).send({ sms: true, whatsapp: true });
    expect((await h.api.post('/v1/notifications/push-devices').set(m.auth).send({ token: 'ExponentPushToken[manager-phone]', platform: 'android' })).status).toBe(200);
    const smsBefore = sms.sent.length, waBefore = wa.sent.length, pushBefore = push.sent.length;
    await apply(future(41));
    await jobs.run('outbox-relay');
    expect(sms.sent.slice(smsBefore).filter((x) => x.to === '+919812300001')).toHaveLength(1);
    expect(sms.sent.at(-1)!.body).toContain('Chan Employee applied for leave');
    expect(wa.sent.slice(waBefore)).toHaveLength(1);
    expect(push.sent.slice(pushBefore)).toMatchObject([{ to: 'ExponentPushToken[manager-phone]', subject: 'Chan Employee applied for leave' }]);

    // the log shows each attempt, and says which provider handled it
    const log = await h.api.get('/v1/company/messages?limit=50').set(w.co.auth);
    expect(log.status).toBe(200);
    const mine = (log.body.data as { channel: string; to: string; status: string; provider: string; userName: string }[]).filter((r) => r.userName === 'Person' || r.to === '+919812300001' || r.to.startsWith('ExponentPushToken[manager'));
    expect(new Set(mine.map((r) => r.channel))).toEqual(new Set(['email', 'sms', 'whatsapp', 'push']));
    expect(mine.every((r) => r.status === 'sent' && (r.channel === 'email' ? r.provider === 'console' : r.provider.startsWith('mock-')))).toBe(true);
    expect(log.body.providers).toContainEqual({ channel: 'sms', provider: 'mock-sms', mock: true });
    expect((await h.api.get('/v1/company/messages').set(s.auth)).status).toBe(403);

    // opting out stops it; revoking the device stops push
    await h.api.put('/v1/notifications/preferences').set(m.auth).send({ sms: false, whatsapp: false });
    await h.api.post('/v1/notifications/push-devices/revoke').set(m.auth).send({ token: 'ExponentPushToken[manager-phone]' });
    const after = [sms.sent.length, wa.sent.length, push.sent.length];
    await apply(future(42));
    await jobs.run('outbox-relay');
    expect([sms.sent.length, wa.sent.length, push.sent.length]).toEqual(after);
  });

  it('records a failed send, keeps the in-app notification, and does not block other channels', async () => {
    const mgr = await w.employee('Fail Manager', { mobile: '+910000000000' });
    const emp = await w.employee('Fail Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    await h.api.put('/v1/notifications/preferences').set(m.auth).send({ sms: true });
    const lop = (await h.api.get('/v1/leave/types').set(s.auth)).body.data.find((t: { code: string }) => t.code === 'LOP');
    await h.api.post('/v1/leave/requests').set(s.auth).send({ employeeId: emp.id, leaveTypeId: lop.id, fromDate: future(50), toDate: future(50) });
    await h.app.get(JobsService).run('outbox-relay');
    const failed = await h.api.get('/v1/company/messages?status=failed').set(w.co.auth);
    expect(failed.body.data.some((r: { channel: string; to: string; error: string }) => r.channel === 'sms' && r.to === '+910000000000' && /simulated failure/.test(r.error))).toBe(true);
    expect((await h.api.get('/v1/notifications').set(m.auth)).body.data.some((n: { type: string }) => n.type === 'leave.requested')).toBe(true);
  });

  it('validates device registration', async () => {
    const e = await w.join(await w.employee('Dev Reg'));
    expect((await h.api.post('/v1/notifications/push-devices').set(e.auth).send({ token: 'short', platform: 'android' })).status).toBe(422);
    expect((await h.api.post('/v1/notifications/push-devices').set(e.auth).send({ token: 'ExponentPushToken[long-enough]', platform: 'palm' })).status).toBe(422);
  });
});
