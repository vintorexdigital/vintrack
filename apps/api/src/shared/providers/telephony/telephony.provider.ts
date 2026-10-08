import { timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';

export interface DialRequest {
  sessionId: string;
  tenantId: string;
  /** The employee's own phone, rung first. */
  agentNumber: string;
  /** The person being called, rung once the employee answers. */
  customerNumber: string;
  callerId?: string | undefined;
  record: boolean;
}

export type CallEvent =
  | { type: 'agent_answered' }
  | { type: 'customer_answered' }
  | { type: 'ended'; outcome: 'completed' | 'no_answer' | 'busy' | 'failed'; durationSeconds: number; recordingRef?: string | undefined };

export interface TelephonyProvider {
  /** Shown to admins and stored with each call. Names starting `mock` never place a real call. */
  readonly name: string;
  dial(req: DialRequest): Promise<{ providerCallId: string }>;
  hangup(providerCallId: string): Promise<void>;
  /** Verify and normalise a status callback from the provider. Null when it is not genuine or not one we act on. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, query: Record<string, string | undefined>): { providerCallId: string; event: CallEvent } | null;
  /** Fetch the audio for a recording reference the provider gave us. */
  fetchRecording(ref: string): Promise<Buffer | null>;
}
export const TELEPHONY = Symbol('TELEPHONY');

/** A short synthetic WAV (8 kHz, mono, 16-bit): a soft two-tone pattern, so a player has something real to play. */
export function syntheticWav(seconds: number): Buffer {
  const rate = 8000;
  const n = Math.max(1, Math.min(30, Math.round(seconds))) * rate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const on = Math.floor(t * 2) % 2 === 0;
    const env = Math.min(1, (t * 2 % 1) * 8, (1 - (t * 2 % 1)) * 8);
    data.writeInt16LE(Math.round((on ? Math.sin(2 * Math.PI * 440 * t) : Math.sin(2 * Math.PI * 330 * t)) * 6000 * env), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/**
 * MOCK telephony. No call is placed and nobody's phone rings. A call is created and then moved along by the
 * `mock-progress` endpoint (the stand-in for the provider's status callbacks), and a recording is a synthetic tone
 * pattern. It exists so the whole calling flow (dial, status, call log, recording, playback, retention, audit)
 * can be built, shown and tested without a telephony account.
 */
export class MockTelephony implements TelephonyProvider {
  readonly name = 'mock-telephony';
  readonly dialed: DialRequest[] = [];
  private readonly log = new Logger('MockTelephony');
  async dial(req: DialRequest) {
    this.dialed.push(req);
    this.log.log(`(mock, no call placed) ${req.agentNumber} -> ${req.customerNumber}${req.record ? ' [recording]' : ''}`);
    return { providerCallId: `mock-${req.sessionId.slice(0, 8)}-${Date.now().toString(36)}` };
  }
  async hangup() { /* nothing to hang up */ }
  parseWebhook(): null { return null; }
  async fetchRecording(ref: string) {
    const m = /^mock:(\d+)$/.exec(ref);
    return m ? syntheticWav(Number(m[1])) : null;
  }
}

type Fetch = typeof fetch;
const safeEq = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Exotel click-to-call: rings the employee, then bridges the customer, optionally recording both sides. Status
 * arrives on a callback that carries a shared token in the URL. Tested against a stubbed fetch and signed-looking
 * sample callbacks only; never run against Exotel.
 */
export class ExotelTelephony implements TelephonyProvider {
  readonly name = 'exotel';
  constructor(private readonly o: { sid: string; apiKey: string; apiToken: string; subdomain: string; callerId: string; callbackBase: string; callbackToken: string }, private readonly fetchFn: Fetch = (...a) => fetch(...a)) {}

  private auth() { return `Basic ${Buffer.from(`${this.o.apiKey}:${this.o.apiToken}`).toString('base64')}`; }

  async dial(req: DialRequest) {
    const form = new URLSearchParams({
      From: req.agentNumber, To: req.customerNumber, CallerId: req.callerId ?? this.o.callerId, Record: String(req.record), RecordingChannels: 'dual',
      CustomField: req.sessionId, StatusCallback: `${this.o.callbackBase}/webhooks/telephony/exotel?t=${req.tenantId}&token=${encodeURIComponent(this.o.callbackToken)}`,
    });
    const res = await this.fetchFn(`https://${this.o.subdomain}/v1/Accounts/${this.o.sid}/Calls/connect.json`, { method: 'POST', headers: { authorization: this.auth(), 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const json = (await res.json().catch(() => ({}))) as { Call?: { Sid?: string }; RestException?: { Message?: string } };
    if (!res.ok || !json.Call?.Sid) throw new Error(`Exotel refused the call (${res.status}): ${json.RestException?.Message ?? 'no detail'}`);
    return { providerCallId: json.Call.Sid };
  }

  async hangup(): Promise<void> { /* Exotel ends the bridge when either side hangs up; there is no server-side cut used here. */ }

  parseWebhook(_h: Record<string, string | string[] | undefined>, rawBody: Buffer, query: Record<string, string | undefined>) {
    if (!query.token || !safeEq(query.token, this.o.callbackToken)) return null;
    const f = new URLSearchParams(rawBody.toString());
    const sid = f.get('CallSid');
    const status = f.get('Status');
    if (!sid || !status) return null;
    const outcome: 'completed' | 'busy' | 'no_answer' | 'failed' = status === 'completed' ? 'completed' : status === 'busy' ? 'busy' : status === 'no-answer' ? 'no_answer' : 'failed';
    return { providerCallId: sid, event: { type: 'ended' as const, outcome, durationSeconds: Number(f.get('DialCallDuration') ?? f.get('Duration') ?? 0) || 0, ...(f.get('RecordingUrl') ? { recordingRef: f.get('RecordingUrl')! } : {}) } };
  }

  async fetchRecording(ref: string) {
    if (!ref.startsWith('https://')) return null;
    const res = await this.fetchFn(ref, { headers: { authorization: this.auth() } });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
}

