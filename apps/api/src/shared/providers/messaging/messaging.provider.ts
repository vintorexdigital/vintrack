import { Injectable, Logger } from '@nestjs/common';

export type Channel = 'email' | 'sms' | 'whatsapp' | 'push';

export interface OutboundMessage {
  channel: Channel;
  to: string;
  template: string;
  subject?: string;
  body: string;
  vars?: Record<string, unknown>;
}

export interface MessagingProvider {
  send(msg: OutboundMessage): Promise<{ providerId: string }>;
}

export const MESSAGING = Symbol('MESSAGING');

/**
 * Development and test provider: keeps messages in memory and logs them. Production swaps in the
 * SES/SMTP and SMS adapters behind the same interface.
 */
@Injectable()
export class ConsoleMessaging implements MessagingProvider {
  private readonly log = new Logger('Messaging');
  readonly sent: OutboundMessage[] = [];

  async send(msg: OutboundMessage): Promise<{ providerId: string }> {
    this.sent.push(msg);
    if (this.sent.length > 500) this.sent.shift();
    this.log.log(`[${msg.channel}] to ${msg.to}: ${msg.subject ?? msg.template}`);
    return { providerId: `console-${this.sent.length}` };
  }

  last(to?: string): OutboundMessage | undefined {
    return [...this.sent].reverse().find((m) => !to || m.to === to);
  }
}
