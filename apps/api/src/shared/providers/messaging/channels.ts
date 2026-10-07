import { Injectable, Logger } from '@nestjs/common';
import type { Config } from '../../../core/config.js';
import type { Channel, MessagingProvider, OutboundMessage } from './messaging.provider.js';

type Fetch = typeof fetch;

/**
 * MOCK delivery for SMS, WhatsApp and push. Nothing leaves the process: messages are kept in memory (and in the
 * company's message log) so the whole flow can be developed, demonstrated and tested without a provider account.
 * A recipient ending in `0000` simulates a provider rejection so failure handling can be seen.
 */
export class MockChannelProvider implements MessagingProvider {
  readonly name: string;
  readonly sent: OutboundMessage[] = [];
  private readonly log: Logger;
  constructor(private readonly channel: Channel) {
    this.name = `mock-${channel}`;
    this.log = new Logger(`Mock ${channel}`);
  }
  async send(msg: OutboundMessage): Promise<{ providerId: string }> {
    if (msg.to.endsWith('0000')) throw new Error('Mock provider rejected this number (simulated failure).');
    this.sent.push(msg);
    if (this.sent.length > 200) this.sent.shift();
    this.log.log(`(mock, not delivered) to ${msg.to}: ${msg.body.slice(0, 80)}`);
    return { providerId: `${this.name}-${this.sent.length}-${Date.now().toString(36)}` };
  }
}

/** Twilio's Messages API for SMS, and for WhatsApp by prefixing numbers with `whatsapp:`. Tested against a stubbed fetch only. */
export class TwilioMessaging implements MessagingProvider {
  readonly name = 'twilio';
  constructor(private readonly o: { accountSid: string; authToken: string; smsFrom?: string | undefined; whatsappFrom?: string | undefined }, private readonly fetchFn: Fetch = (...a) => fetch(...a)) {}

  async send(msg: OutboundMessage): Promise<{ providerId: string }> {
    if (msg.channel !== 'sms' && msg.channel !== 'whatsapp') throw new Error(`Twilio does not carry ${msg.channel}.`);
    const from = msg.channel === 'sms' ? this.o.smsFrom : this.o.whatsappFrom;
    if (!from) throw new Error(`No ${msg.channel} sender is configured.`);
    const wa = (n: string) => `whatsapp:${n}`;
    const form = new URLSearchParams({ To: msg.channel === 'whatsapp' ? wa(msg.to) : msg.to, From: msg.channel === 'whatsapp' ? wa(from) : from, Body: msg.body });
    const res = await this.fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${this.o.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.o.accountSid}:${this.o.authToken}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !json.sid) throw new Error(`Twilio refused the message (${res.status}): ${json.message ?? 'no detail'}`);
    return { providerId: json.sid };
  }
}

/** Expo's push service, for the mobile app. Tested against a stubbed fetch only. */
export class ExpoPushMessaging implements MessagingProvider {
  readonly name = 'expo';
  constructor(private readonly accessToken?: string, private readonly fetchFn: Fetch = (...a) => fetch(...a)) {}

  async send(msg: OutboundMessage): Promise<{ providerId: string }> {
    if (msg.channel !== 'push') throw new Error(`Expo does not carry ${msg.channel}.`);
    const res = await this.fetchFn('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}) },
      body: JSON.stringify({ to: msg.to, title: msg.subject ?? 'Trackrex', body: msg.body, data: msg.vars ?? {}, sound: 'default' }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; id?: string; message?: string; details?: { error?: string } } };
    if (!res.ok || json.data?.status !== 'ok') throw new Error(`Expo refused the push (${res.status}): ${json.data?.message ?? 'no detail'}${json.data?.details?.error === 'DeviceNotRegistered' ? ' [DeviceNotRegistered]' : ''}`);
    return { providerId: json.data.id ?? 'expo' };
  }
}

export interface ChannelProviders {
  email: MessagingProvider;
  sms: MessagingProvider;
  whatsapp: MessagingProvider;
  push: MessagingProvider;
}

/** The provider name each channel is wired to, for the message log and status screens. */
export function providerNames(p: ChannelProviders): Record<Channel, string> {
  const n = (x: MessagingProvider, fallback: string) => (x as { name?: string }).name ?? fallback;
  return { email: n(p.email, 'console'), sms: n(p.sms, 'mock-sms'), whatsapp: n(p.whatsapp, 'mock-whatsapp'), push: n(p.push, 'mock-push') };
}

/** One provider per channel; `send` routes by the message's channel. */
@Injectable()
export class ChannelRouter implements MessagingProvider {
  constructor(readonly providers: ChannelProviders) {}
  get names() { return providerNames(this.providers); }
  isMock(channel: Channel) { return this.names[channel].startsWith('mock') || this.names[channel] === 'console'; }
  send(msg: OutboundMessage) { return this.providers[msg.channel].send(msg); }
}

export function buildProviders(cfg: Config, email: MessagingProvider): ChannelProviders {
  const twilio = cfg.SMS_PROVIDER === 'twilio' || cfg.WHATSAPP_PROVIDER === 'twilio'
    ? new TwilioMessaging({ accountSid: cfg.TWILIO_ACCOUNT_SID!, authToken: cfg.TWILIO_AUTH_TOKEN!, smsFrom: cfg.TWILIO_SMS_FROM, whatsappFrom: cfg.TWILIO_WHATSAPP_FROM })
    : null;
  return {
    email,
    sms: cfg.SMS_PROVIDER === 'twilio' ? twilio! : new MockChannelProvider('sms'),
    whatsapp: cfg.WHATSAPP_PROVIDER === 'twilio' ? twilio! : new MockChannelProvider('whatsapp'),
    push: cfg.PUSH_PROVIDER === 'expo' ? new ExpoPushMessaging(cfg.EXPO_ACCESS_TOKEN) : new MockChannelProvider('push'),
  };
}
