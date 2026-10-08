import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MessagingProvider, OutboundMessage } from './messaging.provider.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Email over SMTP. Other channels are not supported by this provider: they are refused loudly rather than
 * silently dropped, so nobody believes an SMS or WhatsApp message went out when it did not.
 */
export class SmtpMessaging implements MessagingProvider {
  private readonly log = new Logger('Smtp');
  private readonly transport: Transporter;

  constructor(url: string, private readonly from: string, transport?: Transporter) {
    this.transport = transport ?? nodemailer.createTransport(url);
  }

  async send(msg: OutboundMessage): Promise<{ providerId: string }> {
    if (msg.channel !== 'email') throw new Error(`The ${msg.channel} channel is not configured.`);
    const info = await this.transport.sendMail({
      from: this.from, to: msg.to, subject: msg.subject ?? msg.template, text: msg.body,
      html: `<div style="font:14px/1.5 system-ui,sans-serif;color:#17212b">${esc(msg.body).replace(/\n/g, '<br>')}</div>`,
    });
    this.log.log(`email to ${msg.to}: ${msg.subject ?? msg.template}`);
    return { providerId: String(info.messageId) };
  }
}
