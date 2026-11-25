import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { CaimexService } from '../caimex/caimex.service';
import { CustomerDirectory, type Customer } from '../customers/customer.directory';
import { ExtractionService } from '../extraction/extraction.service';
import { MediaStore } from '../media/media.store';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import type { InboundMessage } from '../whatsapp/whatsapp.types';
import { claimStarted, policeReportConfirmed, policeReportSummary } from './replies';
import { SessionStore, type Session } from './session.store';

const CLAIM_INTENT = /\b(claim|accident|crash|collision|hit)\b/i;
const CANCEL_INTENT = /^\s*(cancel|stop|start over)\s*$/i;
const EXTRACTABLE = /^(image\/(jpeg|png|webp)|application\/pdf)/;

const BUTTONS = {
  confirm: { id: 'police_report_confirm', title: 'Yes, correct' },
  retake: { id: 'police_report_retake', title: 'Send again' },
};

const agentSystemPrompt = (c: Customer) => `You are Moovah Car Buddy, a WhatsApp assistant for Moovah motor insurance customers in Zimbabwe.

Customer: ${c.firstName} ${c.surname}, ${c.coverType.replace(/_/g, ' ').toLowerCase()} cover, vehicles: ${c.vehicles
  .map((v) => `${v.year ?? ''} ${v.make} ${v.model} (${v.registration})`.trim())
  .join('; ')}.

Rules:
- Keep replies short and plain for WhatsApp. Use *bold* sparingly. Metric units.
- To make a claim, tell the customer to send the word "claim". Never say a claim is covered, approved or rejected.
- For vehicle-specific figures (tyre pressure, oil grade, service intervals), only give values you can read from a photo the customer sent (for example the tyre placard inside the driver's door) or say where to find them (placard, owner's manual). A photo of a tyre cannot show its pressure; a gauge is needed.
- Safety first: if something sounds dangerous (brakes, steering, smoke, fuel smell, warning lights in red), tell them to stop driving and get help.
- If you are unsure, say so.`;

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly whatsapp: WhatsappClient,
    private readonly sessions: SessionStore,
    private readonly customers: CustomerDirectory,
    private readonly extraction: ExtractionService,
    private readonly caimex: CaimexService,
    private readonly media: MediaStore,
  ) {}

  enqueue(messages: InboundMessage[]): Promise<void> {
    const jobs = messages
      .filter((m) => this.sessions.firstSighting(m.id))
      .map((m) => {
        const previous = this.queues.get(m.from) ?? Promise.resolve();
        const next = previous.then(() => this.handleSafely(m));
        this.queues.set(m.from, next);
        void next.finally(() => {
          if (this.queues.get(m.from) === next) this.queues.delete(m.from);
        });
        return next;
      });
    return Promise.all(jobs).then(() => undefined);
  }

  private async handleSafely(msg: InboundMessage): Promise<void> {
    try {
      await this.handle(msg);
    } catch (err) {
      this.logger.error(`Failed handling ${msg.id} from ${msg.from}`, err instanceof Error ? err.stack : err);
      await this.whatsapp
        .sendText(msg.from, 'Sorry, something went wrong on my side. Please try again in a moment.')
        .catch(() => undefined);
    }
  }

  private async handle(msg: InboundMessage): Promise<void> {
    void this.whatsapp.markRead(msg.id).catch(() => undefined);

    const customer = this.customers.findByPhone(msg.from);
    if (!customer) {
      await this.whatsapp.sendText(
        msg.from,
        "I couldn't find a Moovah motor policy linked to this WhatsApp number. Please contact Moovah on 311 to update your details.",
      );
      return;
    }

    const session = this.sessions.get(msg.from);
    try {
      await this.route(session, customer, msg);
    } finally {
      this.sessions.touch(session);
    }
  }

  private async route(session: Session, customer: Customer, msg: InboundMessage): Promise<void> {
    if (msg.text && CANCEL_INTENT.test(msg.text)) {
      session.state = 'IDLE';
      session.claim = undefined;
      await this.whatsapp.sendText(msg.from, 'Okay, I have cancelled that. How can I help?');
      return;
    }

    if (msg.buttonId === BUTTONS.confirm.id && session.state === 'CONFIRMING_POLICE_REPORT' && session.claim?.policeReport) {
      session.claim.policeReport.confirmedAt = new Date().toISOString();
      session.state = 'IDLE';
      this.logger.log(`Claim ${session.claim.reference}: police report confirmed`);
      await this.whatsapp.sendText(msg.from, policeReportConfirmed(session.claim.reference));
      return;
    }

    if (msg.buttonId === BUTTONS.retake.id && session.claim) {
      session.state = 'AWAITING_POLICE_REPORT';
      await this.whatsapp.sendText(msg.from, 'No problem. Please send the police report photo again.');
      return;
    }

    if (session.state === 'AWAITING_POLICE_REPORT' && msg.media) {
      await this.handlePoliceReport(session, customer, msg);
      return;
    }

    if (session.state === 'IDLE' && msg.text && !msg.media && CLAIM_INTENT.test(msg.text)) {
      await this.startClaim(session, customer, msg.from);
      return;
    }

    if (msg.media?.kind === 'audio') {
      await this.whatsapp.sendText(msg.from, "I can't listen to voice notes yet. Please type your message.");
      return;
    }

    if (msg.unsupportedType || msg.location) {
      await this.whatsapp.sendText(msg.from, 'I can read text, photos and PDFs. How can I help?');
      return;
    }

    await this.agentReply(session, customer, msg);
  }

  private async startClaim(session: Session, customer: Customer, to: string): Promise<void> {
    const vehicle = customer.vehicles[0];
    session.claim = {
      reference: `CLM-${randomBytes(3).toString('hex').toUpperCase()}`,
      vehicleRegistration: vehicle.registration,
      startedAt: new Date().toISOString(),
    };
    session.state = 'AWAITING_POLICE_REPORT';
    await this.whatsapp.sendText(to, claimStarted(customer, session.claim.reference, vehicle.registration));
  }

  private async handlePoliceReport(session: Session, customer: Customer, msg: InboundMessage): Promise<void> {
    const media = msg.media!;
    const claim = session.claim!;
    if (!EXTRACTABLE.test(media.mimeType)) {
      await this.whatsapp.sendText(msg.from, 'Please send the police report as a photo (JPG or PNG) or a PDF.');
      return;
    }

    await this.whatsapp.sendText(msg.from, 'Thanks, reading your police report now…');
    const downloaded = await this.whatsapp.downloadMedia(media.id);
    const stored = await this.media.save(downloaded.data, downloaded.mimeType, `claims/${claim.reference}/police-report`);

    let result;
    try {
      result = await this.extraction.extractPoliceReport(
        [{ data: downloaded.data, mimeType: downloaded.mimeType, filename: media.filename }],
        { insuredRegistration: claim.vehicleRegistration, insuredPolicyNumber: customer.policyNumber },
      );
    } catch (err) {
      this.logger.warn(`Extraction failed for ${claim.reference}: ${err instanceof Error ? err.message : err}`);
      await this.whatsapp.sendText(
        msg.from,
        "I couldn't read that clearly. Please send another photo: flat, in good light, all four corners visible.",
      );
      return;
    }

    claim.policeReport = { media: stored, result };
    const unusable = result.review.flags.some(
      (f) => f.code === 'NOT_A_POLICE_REPORT' || f.code === 'UNREADABLE_DOCUMENT',
    );
    if (unusable) {
      await this.whatsapp.sendText(msg.from, policeReportSummary(result));
      return;
    }

    session.state = 'CONFIRMING_POLICE_REPORT';
    await this.whatsapp.sendButtons(msg.from, policeReportSummary(result), [BUTTONS.confirm, BUTTONS.retake]);
  }

  private async agentReply(session: Session, customer: Customer, msg: InboundMessage): Promise<void> {
    const content: ChatCompletionContentPart[] = [];
    if (msg.media && EXTRACTABLE.test(msg.media.mimeType)) {
      const downloaded = await this.whatsapp.downloadMedia(msg.media.id);
      await this.media.save(downloaded.data, downloaded.mimeType, `chat/${msg.from}`);
      content.push(this.caimex.mediaPart({ data: downloaded.data, mimeType: downloaded.mimeType, filename: msg.media.filename }));
    }
    content.unshift({ type: 'text', text: msg.text?.trim() || 'What can you tell me from this photo?' });

    const reply = await this.caimex.chat([
      { role: 'system', content: agentSystemPrompt(customer) },
      ...session.history,
      { role: 'user', content },
    ]);
    const text = reply.content?.trim() || "Sorry, I don't have an answer for that.";

    session.history.push(
      { role: 'user', content: msg.media ? `[sent a photo] ${msg.text ?? ''}`.trim() : (msg.text ?? '') },
      { role: 'assistant', content: text },
    );
    await this.whatsapp.sendText(msg.from, text);
  }
}
