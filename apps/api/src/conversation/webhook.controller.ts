import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { waitUntil } from '@vercel/functions';
import type { Request } from 'express';
import whatsappConfig from '../whatsapp/whatsapp.config';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import { parseWebhook } from '../whatsapp/webhook.parser';
import type { WebhookPayload } from '../whatsapp/whatsapp.types';
import { ConversationService } from './conversation.service';

@Controller('webhooks/whatsapp')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>,
    private readonly whatsapp: WhatsappClient,
    private readonly conversation: ConversationService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode === 'subscribe' && this.config.verifyToken && token === this.config.verifyToken) return challenge;
    throw new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: WebhookPayload,
  ): { ok: true } {
    if (!this.whatsapp.verifySignature(req.rawBody, signature)) {
      this.logger.warn('Rejected webhook with invalid signature');
      throw new UnauthorizedException();
    }
    const messages = parseWebhook(payload);
    const fields = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.field));
    const summary = messages
      .map((m) => `${m.from}:${m.media?.kind ?? m.unsupportedType ?? (m.buttonId ? 'button' : 'text')}`)
      .join(' ');
    this.logger.log(`Webhook received: object=${payload.object} fields=[${fields.join(',')}] messages=${messages.length} ${summary}`);
    if (messages.length) {
      const work = this.conversation
        .enqueue(messages)
        .catch((err) => this.logger.error('Webhook processing failed', err instanceof Error ? err.stack : err));
      waitUntil(work);
    }
    return { ok: true };
  }
}
