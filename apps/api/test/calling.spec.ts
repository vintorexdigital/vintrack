import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { JobsService } from '../src/jobs/jobs.service.js';
import { ExotelTelephony, MockTelephony, TELEPHONY } from '../src/shared/providers/telephony/telephony.provider.js';
import { STORAGE, type StorageProvider } from '../src/modules/files/storage.js';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); await owner.end(); });

const set = (key: string, value: unknown) => h.api.put(`/v1/settings/${key}`).set(w.co.auth).send({ value });
const progress = (id: string, auth: Record<string, string>, body: Record<string, unknown>) => h.api.post(`/v1/calls/sessions/${id}/mock-progress`).set(auth).send(body);
const audio = (id: string, auth: Record<string, string>) => h.api.get(`/v1/calls/sessions/${id}/recording`).set(auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

describe('cloud calling (mock telephony)', () => {
  it('is off until a company turns it on, and says it is a mock', async () => {
    const mgr = await w.employee('Call Manager', { mobile: '+919800000001' });
    const m = await w.join(mgr, ['manager']);
    const off = await h.api.get('/v1/calls/status').set(m.auth);
    expect(off.body).toMatchObject({ enabled: false, provider: 'mock-telephony', mock: true, recordCalls: false });
    const cust = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Call Customer', phone: '+919811111111' });
    expect((await h.api.post('/v1/calls/dial').set(m.auth).send({ customerId: cust.body.id })).body.code).toBe('calling_off');
  });

  it('runs a whole call: dial, simulated progress, call log entry, recording, playback and audit', async () => {
    await set('calls.provider', 'trackrex');
    await set('calls.record_calls', true);
    const mgr = await w.employee('Rec Manager', { mobile: '+919800000002' });
    const rep = await w.employee('Rec Rep', { reportingManagerId: mgr.id, mobile: '+919800000003' });
    const nomobile = await w.employee('Rec NoPhone');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(rep);
    const np = await w.join(nomobile);
    const cust = (await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Rec Customer', phone: '+919822222222' })).body;
    const nophone = (await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'No Phone Customer' })).body;

    expect((await h.api.post('/v1/calls/dial').set(np.auth).send({ customerId: cust.id })).body.code).toBe('no_mobile');
    expect((await h.api.post('/v1/calls/dial').set(s.auth).send({ customerId: nophone.id })).body.code).toBe('no_number');
    expect((await h.api.post('/v1/calls/dial').set(s.auth).send({})).status).toBe(422);

    const mock = h.app.get<MockTelephony>(TELEPHONY);
    const dial = await h.api.post('/v1/calls/dial').set(s.auth).send({ customerId: cust.id });
    expect(dial.status, JSON.stringify(dial.body)).toBe(200);
    expect(dial.body).toMatchObject({ status: 'ringing_agent', customerNumber: '+919822222222', provider: 'mock-telephony', hasRecording: false });
    expect(mock.dialed.at(-1)).toMatchObject({ agentNumber: '+919800000003', customerNumber: '+919822222222', record: true });
    expect((await h.api.post('/v1/calls/dial').set(s.auth).send({ customerId: cust.id })).body.code).toBe('call_in_progress');

    const id = dial.body.id as string;
    expect((await progress(id, s.auth, { event: 'agent_answered' })).body.status).toBe('ringing_customer');
    expect((await progress(id, s.auth, { event: 'customer_answered' })).body.status).toBe('in_progress');
    const done = await progress(id, s.auth, { event: 'ended', durationSeconds: 95, recording: true });
    expect(done.body).toMatchObject({ status: 'completed', durationSeconds: 95, hasRecording: true });
    // late callbacks change nothing
    expect((await progress(id, s.auth, { event: 'no_answer' })).body.status).toBe('completed');

    // it appears in the call log, linked to the customer
    const log = await h.api.get(`/v1/field/calls?filter[customerId][eq]=${cust.id}`).set(w.co.auth);
    expect(log.body.data[0]).toMatchObject({ phone: '+919822222222', durationSeconds: 95, outcome: 'connected', direction: 'outgoing' });

    // the recording is sealed at rest and plays back as audio
    const key = (await owner.query('select recording_key from call_sessions where id = $1', [id])).rows[0].recording_key as string;
    const stored = await h.app.get<StorageProvider>(STORAGE).get(key);
    expect(stored!.subarray(0, 4).toString()).toBe('TRX1');
    const played = await audio(id, s.auth);
    expect(played.status).toBe(200);
    expect(played.headers['content-type']).toContain('audio/wav');
    expect((played.body as Buffer).subarray(0, 4).toString()).toBe('RIFF');
    expect(played.headers['cache-control']).toContain('no-store');
    expect((await audio(id, m.auth)).status).toBe(200); // the manager of the rep
    const stranger = await w.join(await w.employee('Rec Stranger'));
    expect((await audio(id, stranger.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/calls/sessions/${id}`).set(stranger.auth)).status).toBe(404);
    expect((await h.api.get('/v1/calls/sessions').set(stranger.auth)).body.data).toHaveLength(0);
    expect((await h.api.get(`/v1/calls/sessions?customerId=${cust.id}`).set(m.auth)).body.data).toHaveLength(1);

    // every listen is in the audit log
    const audit = await h.api.get('/v1/audit?entity=call-sessions').set(w.co.auth);
    expect(audit.body.data.filter((a: { action: string }) => a.action === 'recording_played').length).toBe(2);
  });

  it('records nothing unless the company asked for recordings, and logs unanswered calls', async () => {
    await set('calls.record_calls', false);
    const rep = await w.employee('Plain Rep', { mobile: '+919800000004' });
    const s = await w.join(rep);
    const dial = await h.api.post('/v1/calls/dial').set(s.auth).send({ phone: '+919833333333' });
    expect(dial.status).toBe(200);
    const id = dial.body.id as string;
    await progress(id, s.auth, { event: 'agent_answered' });
    const done = await progress(id, s.auth, { event: 'no_answer' });
    expect(done.body).toMatchObject({ status: 'no_answer', hasRecording: false });
    expect((await audio(id, s.auth)).status).toBe(404);
    const second = await h.api.post('/v1/calls/dial').set(s.auth).send({ phone: '+919833333334' });
    await progress(second.body.id, s.auth, { event: 'agent_answered' });
    await progress(second.body.id, s.auth, { event: 'customer_answered' });
    expect((await progress(second.body.id, s.auth, { event: 'ended', durationSeconds: 30, recording: true })).body.hasRecording).toBe(false);
    const log = (await h.api.get('/v1/field/calls?q=919833333333').set(w.co.auth)).body.data[0];
    expect(log).toMatchObject({ outcome: 'no_answer', durationSeconds: 0 });
  });

  it('lets only the person on the call end it, and ends a ringing call as unanswered', async () => {
    const a = await w.join(await w.employee('Hang A', { mobile: '+919800000005' }));
    const b = await w.join(await w.employee('Hang B', { mobile: '+919800000006' }));
    const dial = await h.api.post('/v1/calls/dial').set(a.auth).send({ phone: '+919844444444' });
    expect((await h.api.post(`/v1/calls/sessions/${dial.body.id}/hangup`).set(b.auth).send({})).status).toBe(404);
    expect((await h.api.post(`/v1/calls/sessions/${dial.body.id}/hangup`).set(a.auth).send({})).body.status).toBe('no_answer');
    expect((await h.api.post(`/v1/calls/sessions/${dial.body.id}/mock-progress`).set(b.auth).send({ event: 'agent_answered' })).status).toBe(404);
  });

  it('deletes recordings after the retention period and says so', async () => {
    await set('calls.record_calls', true);
    await set('calls.recording_retention_days', 7);
    const rep = await w.employee('Old Rep', { mobile: '+919800000007' });
    const s = await w.join(rep);
    const dial = await h.api.post('/v1/calls/dial').set(s.auth).send({ phone: '+919855555555' });
    const id = dial.body.id as string;
    await progress(id, s.auth, { event: 'agent_answered' });
    await progress(id, s.auth, { event: 'customer_answered' });
    await progress(id, s.auth, { event: 'ended', durationSeconds: 40, recording: true });
    const key = (await owner.query('select recording_key from call_sessions where id = $1', [id])).rows[0].recording_key as string;
    await h.app.get(JobsService).run('purge-recordings');
    expect(await h.app.get<StorageProvider>(STORAGE).exists(key)).toBe(true); // still within the window
    await owner.query(`update call_sessions set ended_at = now() - interval '9 days' where id = $1`, [id]);
    await h.app.get(JobsService).run('purge-recordings');
    expect(await h.app.get<StorageProvider>(STORAGE).exists(key)).toBe(false);
    const after = await h.api.get(`/v1/calls/sessions/${id}`).set(s.auth);
    expect(after.body).toMatchObject({ hasRecording: false, recordingRemoved: true, status: 'completed' });
    expect((await audio(id, s.auth)).status).toBe(404);
    await set('calls.recording_retention_days', 90);
  });

  it('refuses callbacks it cannot verify, and is closed to support sessions', async () => {
    const t = ((await h.api.get('/v1/auth/me').set(w.co.auth)).body as { company: { id: string } }).company.id;
    expect((await h.api.post(`/v1/webhooks/telephony/mock-telephony?t=${t}`).send({ CallSid: 'x' })).status).toBe(400);
    expect((await h.api.post('/v1/webhooks/telephony/exotel').send({})).status).toBe(400);
  });
});

describe('Exotel adapter (stubbed fetch, never run against Exotel)', () => {
  const opts = { sid: 'acme', apiKey: 'key', apiToken: 'tok', subdomain: 'api.exotel.com', callerId: '08040000000', callbackBase: 'https://api.example.com', callbackToken: 'cb-secret' };
  it('places a click-to-call with recording and a verifiable callback address', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ Call: { Sid: 'EX123' } }), { status: 200 }); }) as unknown as typeof fetch;
    const ex = new ExotelTelephony(opts, fetchFn);
    expect(await ex.dial({ sessionId: 's1', tenantId: 't1', agentNumber: '+919800000001', customerNumber: '+919811111111', record: true })).toEqual({ providerCallId: 'EX123' });
    expect(calls[0]!.url).toBe('https://api.exotel.com/v1/Accounts/acme/Calls/connect.json');
    const form = new URLSearchParams(calls[0]!.init.body as string);
    expect(form.get('From')).toBe('+919800000001');
    expect(form.get('To')).toBe('+919811111111');
    expect(form.get('Record')).toBe('true');
    expect(form.get('StatusCallback')).toBe('https://api.example.com/webhooks/telephony/exotel?t=t1&token=cb-secret');
    const bad = new ExotelTelephony(opts, (async () => new Response(JSON.stringify({ RestException: { Message: 'Invalid number' } }), { status: 400 })) as unknown as typeof fetch);
    await expect(bad.dial({ sessionId: 's', tenantId: 't', agentNumber: 'x', customerNumber: 'y', record: false })).rejects.toThrow(/Invalid number/);
  });
  it('accepts only callbacks that carry the token, and maps statuses', () => {
    const ex = new ExotelTelephony(opts);
    const body = Buffer.from('CallSid=EX123&Status=completed&DialCallDuration=61&RecordingUrl=https%3A%2F%2Frec.example.com%2Fa.mp3');
    expect(ex.parseWebhook({}, body, { token: 'wrong' })).toBeNull();
    expect(ex.parseWebhook({}, body, {})).toBeNull();
    expect(ex.parseWebhook({}, body, { token: 'cb-secret' })).toEqual({ providerCallId: 'EX123', event: { type: 'ended', outcome: 'completed', durationSeconds: 61, recordingRef: 'https://rec.example.com/a.mp3' } });
    expect(ex.parseWebhook({}, Buffer.from('CallSid=EX9&Status=no-answer'), { token: 'cb-secret' })?.event).toMatchObject({ outcome: 'no_answer' });
    expect(ex.parseWebhook({}, Buffer.from('nothing'), { token: 'cb-secret' })).toBeNull();
  });
  it('downloads recordings with credentials, and only over https', async () => {
    const seen: { url: string; auth: string | undefined }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { seen.push({ url, auth: (init.headers as Record<string, string>).authorization }); return new Response(Buffer.from('audio')); }) as unknown as typeof fetch;
    const ex = new ExotelTelephony(opts, fetchFn);
    expect((await ex.fetchRecording('https://rec.example.com/a.mp3'))!.toString()).toBe('audio');
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from('key:tok').toString('base64')}`);
    expect(await ex.fetchRecording('http://insecure/a.mp3')).toBeNull();
  });
});
