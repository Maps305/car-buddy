import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import whatsappConfig from './whatsapp.config';
import type { ReplyButton } from './whatsapp.types';

const MAX_TEXT = 4096;

export class WhatsappApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`WhatsApp API ${status}: ${body.slice(0, 500)}`);
  }
}

export interface DownloadedMedia {
  data: Buffer;
  mimeType: string;
}

@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger(WhatsappClient.name);

  constructor(@Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>) {
    if (!config.accessToken || !config.phoneNumberId) {
      throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set');
    }
  }

  verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    if (this.config.skipSignatureCheck) return true;
    if (!this.config.appSecret || !rawBody || !header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', this.config.appSecret).update(rawBody).digest();
    const received = Buffer.from(header.slice('sha256='.length), 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  async sendText(to: string, body: string): Promise<void> {
    for (let i = 0; i < body.length; i += MAX_TEXT) {
      await this.send(to, { type: 'text', text: { body: body.slice(i, i + MAX_TEXT), preview_url: false } });
    }
  }

  async sendButtons(to: string, body: string, buttons: ReplyButton[]): Promise<void> {
    await this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  async sendTemplate(to: string, name: string, bodyParams: string[] = [], language = 'en'): Promise<void> {
    await this.send(to, {
      type: 'template',
      template: {
        name,
        language: { code: language },
        components: bodyParams.length
          ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
          : [],
      },
    });
  }

  async markRead(messageId: string): Promise<void> {
    await this.graph(`${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
    });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const meta = await this.graph<{ url: string; mime_type: string; file_size?: number }>(mediaId);
    if (meta.file_size && meta.file_size > this.config.maxMediaBytes) {
      throw new Error(`Media ${mediaId} is ${meta.file_size} bytes, over the ${this.config.maxMediaBytes} limit`);
    }
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.config.accessToken}` } });
    if (!res.ok) throw new WhatsappApiError(res.status, await res.text());
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type };
  }

  private async send(to: string, message: Record<string, unknown>): Promise<void> {
    await this.graph(`${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
    });
  }

  private async graph<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://graph.facebook.com/${this.config.graphVersion}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Graph ${init.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      throw new WhatsappApiError(res.status, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}
