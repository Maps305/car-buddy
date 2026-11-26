import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { CaimexService, describeCaimexError } from '../caimex/caimex.service';
import type { Actor } from '../claims/claim-transitions';
import { ClaimsService, type Claim } from '../claims/claims.service';
import { CustomerDirectory, type Customer, type InsuredVehicle } from '../customers/customer.directory';
import { ExtractionService, type PoliceReportResult } from '../extraction/extraction.service';
import { MediaStore } from '../media/media.store';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import type { InboundMessage } from '../whatsapp/whatsapp.types';
import {
  POLICE_REPORT_FORM_URL,
  chooseVehicle,
  claimResume,
  claimStarted,
  claimSubmitted,
  infoReplyAdded,
  infoReplySent,
  policeReportConfirmed,
  policeReportSummary,
} from './replies';
import { SessionStore, type Session } from './session.store';
import {
  DECLARATION_TEXT,
  INTAKE_BUTTONS,
  PHOTO_STEPS,
  QUOTES_WANTED,
  WEATHER_BY_BUTTON,
  intakePrompt,
  nextStep,
  parseDriverAnswer,
  parseDriverDetails,
  parseSpeed,
  parseWeather,
  type IntakeDocs,
  type IntakeStep,
  type Prompt,
} from './claim-intake';
import type { ClaimIntake } from '../db/schema';

const CLAIM_START =
  /^(please\s+)?(?:(?:i\s+want\s+to\s+|i'?d\s+like\s+to\s+)?(?:make|start|open|lodge|file|submit)\s+(?:a\s+|my\s+)?(?:new\s+)?claim\b|(?:new\s+)?claim\s*[.!]*$|report\s+(?:an?\s+)?(?:accident|crash|collision)\b|i\s+(?:had|have\s+had|was\s+in|got\s+into)\s+(?:an?\s+)?(?:accident|crash|collision)\b)/i;
const QUESTION = /\?|^(where|how|what|when|which|who|why|can|could|do|does|is|are|should|will|would)\b/i;

const isClaimStart = (text: string) => {
  const t = text.trim();
  return !QUESTION.test(t) && CLAIM_START.test(t);
};
const CANCEL_INTENT = /^\s*(cancel|stop|start over)\s*$/i;
const EXTRACTABLE = /^(image\/(jpeg|png|webp)|application\/pdf)/;
const VEHICLE_BUTTON = 'vehicle:';
const INFO_DONE_BUTTON = 'info_done:';
const DONE_TEXT = /^\s*done\s*[.!]*\s*$/i;
const INFO_ACK_GAP_MS = 15_000;
const INTAKE_BUTTON = 'intake:';
const CONFIRM_TEXT = /^\s*(i\s+)?(confirm|agree)\b|^\s*yes\s*[.!]*\s*$/i;
const SKIP_TEXT = /^\s*skip\b/i;

const INTAKE_DOC_TYPE = {
  LICENCE_FRONT: 'DRIVER_LICENCE',
  LICENCE_BACK: 'DRIVER_LICENCE',
  ID: 'ID_COPY',
  SKETCH: 'SKETCH',
  DAMAGE: 'DAMAGE_PHOTO',
  QUOTATIONS: 'QUOTATION',
} as const;
const LATER_TEXT = /\b(later|not yet|don'?t have|do not have|none)\b|^\s*no\s*[.!]*\s*$/i;

const INTAKE_HINT: Record<IntakeStep, string> = {
  DRIVER: 'Please tap *It was me* or *Someone else*.',
  DRIVER_DETAILS: "I couldn't find a name and phone number in that.",
  LICENCE_FRONT: 'Please send a photo of the licence.',
  LICENCE_BACK: 'Please send a photo of the back of the licence.',
  ID: 'Please send a photo of the ID.',
  SPEED: 'Please reply with a number in km/h.',
  WEATHER: 'Please tap one of the options.',
  DESCRIPTION: 'Please tell me a little more about what happened.',
  SKETCH: 'Please send a photo of your sketch, or tap *Skip sketch*.',
  DAMAGE: 'Please send photos of the damage.',
  QUOTATIONS: 'Please send a photo of a quotation, or tap *Send later*.',
  DECLARATION: 'Please tap *I confirm* to submit the claim, or send *cancel* to close it.',
};
const normalisePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const BUTTONS = {
  confirm: { id: 'police_report_confirm', title: 'Yes, correct' },
  retake: { id: 'police_report_retake', title: 'Send again' },
};

interface ClaimContext {
  reference: string;
  registration: string;
  waitingFor: 'POLICE_REPORT' | 'CONFIRMATION' | 'DETAILS';
}

const MOOVAH_CLAIM_FACTS = `Moovah motor accident claims (from Moovah's own claim forms):
- The police report must be on Moovah's "Motor Accident Police Report" form. The customer downloads it (${POLICE_REPORT_FORM_URL}), takes it to the ZRP station where the accident was reported, and the police complete and stamp it. The report is identified by its TAB number.
- Moovah's checklist for an accident claim: completed Motor Accident Claim Form, the police report, 3 quotations from reputable suppliers, a copy of the insured's ID, and a copy of the driver's licence (front and back). Accidents involving public service vehicles also need a valid defensive driver's certificate.
- Claim forms are on Moovah's forms page: https://moovah.co.zw/make-a-claim-forms/ (Motor Accident Claim Form: https://moovah.co.zw/wp-content/uploads/2026/03/117597-MOOVAH-MOTOR-ACCIDENT-CLAIM-FORM.pdf). In this chat the customer does not need to fill in the claim form on paper: Car Buddy collects the claim step by step after they send "claim".
- Moovah can be called on 311.`;

const agentSystemPrompt = (c: Customer, claim?: ClaimContext) => `You are Moovah Car Buddy, a WhatsApp assistant for Moovah motor insurance customers in Zimbabwe.

Customer: ${c.firstName} ${c.surname}, ${c.policy.coverType.replace(/_/g, ' ').toLowerCase()} cover, vehicles: ${c.vehicles
  .map((v) => `${v.year ?? ''} ${v.make} ${v.model} (${v.registration})`.trim())
  .join('; ')}.

${
  claim
    ? `Open claim: ${claim.reference} for ${claim.registration}. This chat is ${
        claim.waitingFor === 'POLICE_REPORT'
          ? 'waiting for a photo of the completed, stamped police report'
          : claim.waitingFor === 'DETAILS'
            ? 'collecting the rest of the claim (driver, licence, ID, speed, weather, what happened, a sketch, damage photos and a declaration) one question at a time; the question will be repeated after your answer'
            : 'waiting for the customer to confirm the police report details already sent'
      }. Answer their question, then remind them of that next step. Do not start another claim, do not tell them to send "claim", and do not ask for other claim details: this chat requests them one step at a time.`
    : 'No claim is open. To start one, the customer sends the word "claim".'
}

${MOOVAH_CLAIM_FACTS}

Rules:
- Keep replies short and plain for WhatsApp. Use *bold* sparingly. Metric units.
- Never say a claim is covered, approved or rejected.
- Use only the Moovah facts above for claim procedures. Do not invent steps, offices, reference numbers or contacts; if something isn't covered, say you're not sure and suggest calling Moovah on 311.
- For vehicle-specific figures (tyre pressure, oil grade, service intervals), only give values you can read from a photo the customer sent (for example the tyre placard inside the driver's door) or say where to find them (placard, owner's manual). A photo of a tyre cannot show its pressure; a gauge is needed.
- Safety first: if something sounds dangerous (brakes, steering, smoke, fuel smell, warning lights in red), tell them to stop driving and get help.
- If you are unsure, say so.`;

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly queues = new Map<string, Promise<void>>();
  private readonly infoAcks = new Map<string, number>();

  constructor(
    private readonly whatsapp: WhatsappClient,
    private readonly sessions: SessionStore,
    private readonly customers: CustomerDirectory,
    private readonly extraction: ExtractionService,
    private readonly caimex: CaimexService,
    private readonly media: MediaStore,
    private readonly claims: ClaimsService,
  ) {}

  enqueue(messages: InboundMessage[]): Promise<void> {
    const jobs = messages.map((m) => {
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
      if (!(await this.sessions.firstSighting(msg.id))) return;
      await this.handle(msg);
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `\nCaused by: ${err.cause.message}` : '';
      this.logger.error(`Failed handling ${msg.id} from ${msg.from}${cause}`, err instanceof Error ? err.stack : err);
      await this.whatsapp
        .sendText(msg.from, 'Sorry, something went wrong on my side. Please try again in a moment.')
        .catch(() => undefined);
    }
  }

  private async handle(msg: InboundMessage): Promise<void> {
    void this.whatsapp.markRead(msg.id).catch(() => undefined);

    const customer = await this.customers.findByPhone(msg.from);
    if (!customer) {
      await this.whatsapp.sendText(
        msg.from,
        "I couldn't find a Moovah motor policy linked to this WhatsApp number. Please contact Moovah on 311 to update your details.",
      );
      return;
    }

    const session = await this.sessions.get(msg.from);
    session.customerId = customer.id;
    try {
      await this.syncOpenClaim(session, customer);
      await this.route(session, customer, msg);
    } finally {
      await this.sessions.save(session);
    }
  }

  private async route(session: Session, customer: Customer, msg: InboundMessage): Promise<void> {
    const actor: Actor = { type: 'CUSTOMER', id: customer.id };

    if (msg.text && CANCEL_INTENT.test(msg.text)) {
      if (session.activeClaimId) {
        await this.claims.transition(session.activeClaimId, 'CLOSED', actor, {
          reason: 'Cancelled by customer on WhatsApp',
        });
      }
      session.state = 'IDLE';
      session.activeClaimId = null;
      session.history = [];
      await this.whatsapp.sendText(msg.from, 'Okay, I have cancelled that. How can I help?');
      return;
    }

    if (msg.buttonId === BUTTONS.confirm.id && session.state === 'CONFIRMING_POLICE_REPORT' && session.activeClaimId) {
      await this.confirmPoliceReport(session, customer, actor, msg.from);
      return;
    }

    if (msg.buttonId === BUTTONS.retake.id && session.activeClaimId) {
      session.state = 'AWAITING_POLICE_REPORT';
      await this.whatsapp.sendText(msg.from, 'No problem. Please send the police report photo again.');
      return;
    }

    if (msg.buttonId?.startsWith(INFO_DONE_BUTTON)) {
      await this.finishInfoReply(customer, msg.buttonId.slice(INFO_DONE_BUTTON.length), msg.from);
      return;
    }

    if (session.state === 'COLLECTING_DETAILS' && session.activeClaimId) {
      if (await this.handleIntake(session, customer, msg)) return;
    } else if (msg.buttonId?.startsWith(INTAKE_BUTTON)) {
      await this.whatsapp.sendText(msg.from, "That claim is already submitted. I'll message you here when there's an update.");
      return;
    }

    if (session.state === 'IDLE' && !(msg.text && !msg.media && isClaimStart(msg.text))) {
      const awaiting = await this.claims.findAwaitingInfo(customer.id);
      if (awaiting && (await this.handleInfoReply(customer, awaiting, msg))) return;
    }

    if (session.state === 'CHOOSING_VEHICLE') {
      const vehicle = this.pickVehicle(customer, msg);
      if (vehicle) {
        await this.openClaim(session, customer, vehicle, msg.from, false);
        return;
      }
      if (!msg.text || isClaimStart(msg.text) || !msg.text.trim().includes(' ')) {
        await this.askForVehicle(customer, msg.from);
        return;
      }
    }

    if (
      (session.state === 'AWAITING_POLICE_REPORT' || session.state === 'CONFIRMING_POLICE_REPORT') &&
      msg.media &&
      msg.media.kind !== 'audio'
    ) {
      await this.handlePoliceReport(session, customer, msg);
      return;
    }

    if (msg.text && !msg.media && isClaimStart(msg.text) && session.state !== 'CHOOSING_VEHICLE') {
      if (session.activeClaimId) await this.resumeClaim(session, customer, msg.from);
      else await this.startClaim(session, customer, msg.from);
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

  private async syncOpenClaim(session: Session, customer: Customer): Promise<void> {
    if (session.state === 'CHOOSING_VEHICLE') return;
    const draft = await this.claims.findOpenDraft(customer.id);
    if (!draft) {
      session.activeClaimId = null;
      session.state = 'IDLE';
      return;
    }
    if (session.activeClaimId === draft.id && session.state !== 'IDLE') return;
    session.activeClaimId = draft.id;
    const report = await this.claims.latestDocument(draft.id, 'POLICE_REPORT');
    session.state = !report
      ? 'AWAITING_POLICE_REPORT'
      : report.customerConfirmedAt
        ? 'COLLECTING_DETAILS'
        : 'CONFIRMING_POLICE_REPORT';
  }

  private async startClaim(session: Session, customer: Customer, to: string): Promise<void> {
    const vehicles = [...customer.vehicles].sort((a, b) => a.registration.localeCompare(b.registration));
    if (vehicles.length === 0) {
      await this.whatsapp.sendText(to, 'I could not find a vehicle on your Moovah policy. Please contact Moovah on 311.');
      return;
    }
    if (vehicles.length === 1) {
      await this.openClaim(session, customer, vehicles[0], to, true);
      return;
    }
    session.state = 'CHOOSING_VEHICLE';
    await this.askForVehicle(customer, to);
  }

  private async askForVehicle(customer: Customer, to: string): Promise<void> {
    const vehicles = [...customer.vehicles].sort((a, b) => a.registration.localeCompare(b.registration));
    if (vehicles.length <= 3) {
      await this.whatsapp.sendButtons(
        to,
        chooseVehicle(customer),
        vehicles.map((v) => ({ id: `${VEHICLE_BUTTON}${v.id}`, title: v.registration })),
      );
    } else {
      await this.whatsapp.sendText(to, chooseVehicle(customer));
    }
  }

  private pickVehicle(customer: Customer, msg: InboundMessage): InsuredVehicle | undefined {
    if (msg.buttonId?.startsWith(VEHICLE_BUTTON)) {
      return customer.vehicles.find((v) => v.id === msg.buttonId!.slice(VEHICLE_BUTTON.length));
    }
    const text = msg.text ? normalisePlate(msg.text) : '';
    return text ? customer.vehicles.find((v) => text.includes(normalisePlate(v.registration))) : undefined;
  }

  private async openClaim(
    session: Session,
    customer: Customer,
    vehicle: InsuredVehicle,
    to: string,
    greet: boolean,
  ): Promise<void> {
    const claim = await this.claims.createDraft(
      { customerId: customer.id, policyId: customer.policy.id, vehicleId: vehicle.id },
      { type: 'CUSTOMER', id: customer.id },
    );
    session.activeClaimId = claim.id;
    session.state = 'AWAITING_POLICE_REPORT';
    session.history = [];
    await this.whatsapp.sendText(to, claimStarted(customer, claim.reference, vehicle.registration, greet));
  }

  private async claimContext(session: Session, customer: Customer): Promise<ClaimContext | undefined> {
    if (!session.activeClaimId) return undefined;
    const claim = await this.claims.get(session.activeClaimId);
    const vehicle = customer.vehicles.find((v) => v.id === claim.vehicleId);
    return {
      reference: claim.reference,
      registration: vehicle?.registration ?? 'your vehicle',
      waitingFor:
        session.state === 'CONFIRMING_POLICE_REPORT'
          ? 'CONFIRMATION'
          : session.state === 'COLLECTING_DETAILS'
            ? 'DETAILS'
            : 'POLICE_REPORT',
    };
  }

  private async resumeClaim(session: Session, customer: Customer, to: string): Promise<void> {
    const ctx = (await this.claimContext(session, customer))!;
    if (ctx.waitingFor === 'DETAILS') {
      await this.whatsapp.sendText(to, claimResume(ctx.reference, ctx.registration, 'DETAILS'));
      await this.promptIntake(session, customer, to);
      return;
    }
    if (ctx.waitingFor === 'CONFIRMATION') {
      const report = await this.claims.latestDocument(session.activeClaimId!, 'POLICE_REPORT');
      if (report?.extraction && report.review) {
        const summary = policeReportSummary({
          extraction: report.extraction as PoliceReportResult['extraction'],
          review: report.review as PoliceReportResult['review'],
        });
        await this.whatsapp.sendText(to, claimResume(ctx.reference, ctx.registration, 'CONFIRMATION'));
        await this.whatsapp.sendButtons(to, summary, [BUTTONS.confirm, BUTTONS.retake]);
        return;
      }
    }
    await this.whatsapp.sendText(to, claimResume(ctx.reference, ctx.registration, 'POLICE_REPORT'));
  }

  private async confirmPoliceReport(session: Session, customer: Customer, actor: Actor, to: string): Promise<void> {
    const claimId = session.activeClaimId!;
    const doc = await this.claims.latestDocument(claimId, 'POLICE_REPORT');
    if (!doc) {
      session.state = 'AWAITING_POLICE_REPORT';
      await this.whatsapp.sendText(to, 'I could not find your police report. Please send the photo again.');
      return;
    }

    await this.claims.confirmDocument(doc.id, actor);
    const x = (doc.extraction as PoliceReportResult['extraction'] | null) ?? undefined;
    const review = (doc.review as PoliceReportResult['review'] | null) ?? undefined;
    await this.claims.updateDraftDetails(claimId, {
      accidentDate: x?.accidentDate.value ?? undefined,
      accidentTime: x?.accidentTime.value ?? undefined,
      accidentPlace: x?.placeOfOccurrence.value ?? undefined,
    });
    const insured = x?.parties.find((p) => p.position === review?.insuredParty);
    await this.claims.updateIntake(claimId, {
      reportDriverName: insured?.driverName.value ?? undefined,
      reportDriverPhone: insured?.contactNumber.value ?? undefined,
    });

    const claim = await this.claims.get(claimId);
    session.state = 'COLLECTING_DETAILS';
    await this.whatsapp.sendText(to, policeReportConfirmed(claim.reference));
    await this.promptIntake(session, customer, to);
  }

  private async intakeState(claimId: string) {
    const claim = await this.claims.get(claimId);
    const counts = await this.claims.documentCounts(claimId);
    const docs: IntakeDocs = {
      licence: counts.DRIVER_LICENCE ?? 0,
      id: counts.ID_COPY ?? 0,
      sketch: counts.SKETCH ?? 0,
      damage: counts.DAMAGE_PHOTO ?? 0,
      quotes: counts.QUOTATION ?? 0,
    };
    return { claim, docs, step: nextStep(claim.intake, docs) };
  }

  private async promptIntake(session: Session, customer: Customer, to: string, hint?: string): Promise<void> {
    const { claim, docs, step } = await this.intakeState(session.activeClaimId!);
    if (!step) {
      await this.submitClaim(session, customer, to);
      return;
    }
    const registration = customer.vehicles.find((v) => v.id === claim.vehicleId)?.registration ?? 'your vehicle';
    const prompt = intakePrompt(step, { reference: claim.reference, registration, intake: claim.intake, docs });
    await this.sendPrompt(to, hint ? { ...prompt, text: `${hint}\n\n${prompt.text}` } : prompt);
  }

  private sendPrompt(to: string, prompt: Prompt): Promise<unknown> {
    return prompt.buttons ? this.whatsapp.sendButtons(to, prompt.text, prompt.buttons) : this.whatsapp.sendText(to, prompt.text);
  }

  private async handleIntake(session: Session, customer: Customer, msg: InboundMessage): Promise<boolean> {
    const text = msg.text?.trim();
    if (text && !msg.media && isClaimStart(text)) return false;
    if (msg.media?.kind === 'audio' || msg.unsupportedType || msg.location) return false;

    const actor: Actor = { type: 'CUSTOMER', id: customer.id };
    const claimId = session.activeClaimId!;
    const { claim, docs, step } = await this.intakeState(claimId);
    if (!step) {
      await this.submitClaim(session, customer, msg.from);
      return true;
    }
    const fullName = `${customer.firstName} ${customer.surname}`;
    const save = async (patch: ClaimIntake) => {
      await this.claims.updateIntake(claimId, patch);
      await this.promptIntake(session, customer, msg.from);
      return true;
    };
    const chooseDriver = (who: 'INSURED' | 'OTHER') =>
      save(
        who === 'INSURED'
          ? { driver: 'INSURED', driverName: fullName, driverPhone: customer.phone }
          : { driver: 'OTHER', driverName: claim.intake.reportDriverName, driverPhone: claim.intake.reportDriverPhone },
      );
    const skipSketch = async () => {
      await this.claims.recordEvent(claimId, 'SKETCH_SKIPPED', actor);
      await this.whatsapp.sendText(msg.from, 'Okay, skipped. The claims team may ask you for a sketch later.');
      return save({ sketchSkipped: true });
    };
    const finishDamage = async () => {
      if (docs.damage < 1) {
        await this.promptIntake(session, customer, msg.from, 'Please send at least one photo of the damage first.');
        return true;
      }
      this.infoAcks.delete(msg.from);
      return save({ damageDone: true });
    };

    if (msg.media) {
      if (!PHOTO_STEPS.has(step)) {
        await this.promptIntake(session, customer, msg.from, 'Please answer this question first.');
        return true;
      }
      if (!EXTRACTABLE.test(msg.media.mimeType)) {
        await this.whatsapp.sendText(msg.from, 'Please send a photo (JPG or PNG) or a PDF.');
        return true;
      }
      const type = INTAKE_DOC_TYPE[step as keyof typeof INTAKE_DOC_TYPE];
      const downloaded = await this.whatsapp.downloadMedia(msg.media.id);
      const stored = await this.media.save(downloaded.data, downloaded.mimeType, `claims/${claim.reference}/intake`);
      if (step === 'QUOTATIONS') {
        const quote = await this.saveQuotation(claim, downloaded, stored, msg, actor);
        if (!quote.isQuotation) {
          await this.promptIntake(session, customer, msg.from, quote.message);
          return true;
        }
        await this.promptIntake(session, customer, msg.from, `${quote.message} (${docs.quotes + 1} of ${QUOTES_WANTED})`);
        return true;
      }
      await this.claims.addDocument(
        claimId,
        {
          type,
          storageKey: stored.key,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
          sha256: stored.sha256,
          whatsappMediaId: msg.media.id,
        },
        actor,
      );
      if (step === 'DAMAGE') {
        const last = this.infoAcks.get(msg.from) ?? 0;
        if (Date.now() - last < INFO_ACK_GAP_MS) return true;
        this.infoAcks.set(msg.from, Date.now());
      }
      await this.promptIntake(session, customer, msg.from);
      return true;
    }

    if (msg.buttonId?.startsWith(INTAKE_BUTTON)) {
      const b = msg.buttonId;
      if (step === 'DRIVER' && b === INTAKE_BUTTONS.driverMe.id) return chooseDriver('INSURED');
      if (step === 'DRIVER' && b === INTAKE_BUTTONS.driverOther.id) return chooseDriver('OTHER');
      if (step === 'WEATHER' && WEATHER_BY_BUTTON[b]) return save({ weather: WEATHER_BY_BUTTON[b] });
      if (step === 'SKETCH' && b === INTAKE_BUTTONS.skipSketch.id) return skipSketch();
      if (step === 'DAMAGE' && b === INTAKE_BUTTONS.damageDone.id) return finishDamage();
      if (step === 'QUOTATIONS' && b === INTAKE_BUTTONS.quotesLater.id) return save({ quotesLater: true });
      if (step === 'QUOTATIONS' && b === INTAKE_BUTTONS.quotesDone.id)
        return save(docs.quotes > 0 ? { quotesDone: true } : { quotesLater: true });
      if (step === 'DECLARATION' && b === INTAKE_BUTTONS.declare.id) {
        await this.submitClaim(session, customer, msg.from);
        return true;
      }
      await this.promptIntake(session, customer, msg.from);
      return true;
    }

    if (!text) return false;
    switch (step) {
      case 'DRIVER': {
        const who = parseDriverAnswer(text);
        if (who) return chooseDriver(who);
        break;
      }
      case 'DRIVER_DETAILS': {
        const d = parseDriverDetails(text, claim.intake.driverName);
        if (d) return save({ driverName: d.name, driverPhone: d.phone });
        break;
      }
      case 'SPEED': {
        const n = parseSpeed(text);
        if (n !== null) return save({ speedKmh: n });
        break;
      }
      case 'WEATHER': {
        const w = QUESTION.test(text) ? null : parseWeather(text);
        if (w) return save({ weather: w });
        break;
      }
      case 'DESCRIPTION':
        if (text.length >= 15 && !text.endsWith('?')) return save({ description: text.slice(0, 4000) });
        break;
      case 'SKETCH':
        if (SKIP_TEXT.test(text)) return skipSketch();
        break;
      case 'DAMAGE':
        if (DONE_TEXT.test(text)) return finishDamage();
        break;
      case 'QUOTATIONS':
        if (DONE_TEXT.test(text)) return save(docs.quotes > 0 ? { quotesDone: true } : { quotesLater: true });
        if (LATER_TEXT.test(text) && !text.includes('?')) return save({ quotesLater: true });
        break;
      case 'DECLARATION':
        if (CONFIRM_TEXT.test(text)) {
          await this.submitClaim(session, customer, msg.from);
          return true;
        }
        break;
    }

    if (QUESTION.test(text)) {
      await this.agentReply(session, customer, msg);
      await this.promptIntake(session, customer, msg.from);
      return true;
    }
    await this.promptIntake(session, customer, msg.from, INTAKE_HINT[step]);
    return true;
  }

  private async saveQuotation(
    claim: Claim,
    file: { data: Buffer; mimeType: string },
    stored: { key: string; mimeType: string; bytes: number; sha256: string },
    msg: InboundMessage,
    actor: Actor,
  ): Promise<{ isQuotation: boolean; message: string }> {
    let read: Awaited<ReturnType<ExtractionService['extractQuotation']>> | undefined;
    try {
      read = await this.extraction.extractQuotation({ data: file.data, mimeType: file.mimeType, filename: msg.media?.filename });
    } catch (err) {
      this.logger.error(`Quotation reading failed for ${claim.reference}: ${describeCaimexError(err)}`);
    }
    const isQuotation = read ? read.extraction.isQuotation : true;
    await this.claims.addDocument(
      claim.id,
      {
        type: isQuotation ? 'QUOTATION' : 'OTHER',
        storageKey: stored.key,
        mimeType: stored.mimeType,
        bytes: stored.bytes,
        sha256: stored.sha256,
        whatsappMediaId: msg.media?.id,
        extraction: read?.extraction,
        extractionModel: read?.model,
      },
      actor,
    );
    if (!isQuotation) {
      return { isQuotation, message: "That doesn't look like a repair quotation, so I haven't counted it." };
    }
    const x = read?.extraction;
    const total = x?.total.value;
    const amount = typeof total === 'number' ? ` ${x?.currency.value ?? ''} ${total.toFixed(2)}`.replace(/\s+/g, ' ') : '';
    const supplier = x?.supplier.value;
    return {
      isQuotation,
      message: supplier || amount ? `Got it: ${[supplier, amount.trim()].filter(Boolean).join(', ')}` : 'Got the quotation',
    };
  }

  private async submitClaim(session: Session, customer: Customer, to: string): Promise<void> {
    const claimId = session.activeClaimId!;
    const actor: Actor = { type: 'CUSTOMER', id: customer.id };
    const intake = await this.claims.updateIntake(claimId, { declaredAt: new Date().toISOString() });
    await this.claims.recordEvent(claimId, 'DECLARATION_ACCEPTED', actor, { text: DECLARATION_TEXT });
    await this.claims.updateDraftDetails(claimId, { description: intake.description });
    const claim = await this.claims.transition(claimId, 'SUBMITTED', actor);

    session.state = 'IDLE';
    session.activeClaimId = null;
    session.history = [];
    this.logger.log(`Claim ${claim.reference} submitted`);
    await this.whatsapp.sendText(to, claimSubmitted(claim.reference));
  }

  private async handleInfoReply(customer: Customer, claim: Claim, msg: InboundMessage): Promise<boolean> {
    const actor: Actor = { type: 'CUSTOMER', id: customer.id };

    if (msg.media) {
      if (msg.media.kind === 'audio') return false;
      if (!EXTRACTABLE.test(msg.media.mimeType)) {
        await this.whatsapp.sendText(msg.from, 'Please send photos (JPG or PNG) or PDFs.');
        return true;
      }
      const downloaded = await this.whatsapp.downloadMedia(msg.media.id);
      const stored = await this.media.save(downloaded.data, downloaded.mimeType, `claims/${claim.reference}/info`);
      const quotes = (await this.claims.documentCounts(claim.id)).QUOTATION ?? 0;
      if (quotes < QUOTES_WANTED) await this.saveQuotation(claim, downloaded, stored, msg, actor);
      else
        await this.claims.addDocument(
          claim.id,
          {
            type: 'OTHER',
            storageKey: stored.key,
            mimeType: stored.mimeType,
            bytes: stored.bytes,
            sha256: stored.sha256,
            whatsappMediaId: msg.media.id,
          },
          actor,
        );
      const caption = msg.media.caption?.trim();
      if (caption) await this.claims.addCustomerReply(claim.id, caption, actor);
    } else if (msg.location) {
      const { latitude, longitude, name, address } = msg.location;
      const place = [name, address].filter(Boolean).join(', ');
      await this.claims.addCustomerReply(
        claim.id,
        `Shared a location: ${place ? `${place} ` : ''}(${latitude}, ${longitude})`,
        actor,
      );
    } else if (msg.text?.trim()) {
      if (DONE_TEXT.test(msg.text)) {
        await this.finishInfoReply(customer, claim.id, msg.from);
        return true;
      }
      await this.claims.addCustomerReply(claim.id, msg.text.trim(), actor);
    } else {
      return false;
    }

    const last = this.infoAcks.get(msg.from) ?? 0;
    if (Date.now() - last >= INFO_ACK_GAP_MS) {
      this.infoAcks.set(msg.from, Date.now());
      await this.whatsapp.sendButtons(msg.from, infoReplyAdded(claim.reference), [
        { id: `${INFO_DONE_BUTTON}${claim.id}`, title: 'Done' },
      ]);
    }
    return true;
  }

  private async finishInfoReply(customer: Customer, claimId: string, to: string): Promise<void> {
    const claim = await this.claims.get(claimId).catch(() => undefined);
    if (!claim || claim.customerId !== customer.id || claim.status !== 'ADDITIONAL_INFO_REQUIRED') {
      await this.whatsapp.sendText(to, "That request is already with the claims team. I'll message you here if Moovah needs anything else.");
      return;
    }
    if ((await this.claims.repliesSinceInfoRequest(claim.id)) === 0) {
      await this.whatsapp.sendText(to, 'Please send the information Moovah asked for first, then reply *done*.');
      return;
    }
    await this.claims.resumeAfterInfo(claim.id, { type: 'CUSTOMER', id: customer.id }, {
      reason: 'Customer sent the requested information',
    });
    this.infoAcks.delete(to);
    await this.whatsapp.sendText(to, infoReplySent(claim.reference));
  }

  private async handlePoliceReport(session: Session, customer: Customer, msg: InboundMessage): Promise<void> {
    const media = msg.media!;
    const claim = await this.claims.get(session.activeClaimId!);
    const vehicle = customer.vehicles.find((v) => v.id === claim.vehicleId);
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
        { insuredRegistration: vehicle?.registration ?? '', insuredPolicyNumber: customer.policy.policyNumber },
      );
    } catch (err) {
      this.logger.error(`Extraction failed for ${claim.reference}: ${describeCaimexError(err)}`);
      await this.whatsapp.sendText(
        msg.from,
        `Something went wrong on our side while reading your report. Your claim ${claim.reference} is saved; please send the report again in a few minutes.`,
      );
      return;
    }

    const unusable = result.review.flags.some(
      (f) => f.code === 'NOT_A_POLICE_REPORT' || f.code === 'UNREADABLE_DOCUMENT',
    );
    await this.claims.addDocument(
      claim.id,
      {
        type: unusable ? 'OTHER' : 'POLICE_REPORT',
        storageKey: stored.key,
        mimeType: stored.mimeType,
        bytes: stored.bytes,
        sha256: stored.sha256,
        whatsappMediaId: media.id,
        extraction: result.extraction,
        review: result.review,
        extractionModel: result.model,
        needsHumanReview: result.review.needsHumanReview,
      },
      { type: 'CUSTOMER', id: customer.id },
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
      { role: 'system', content: agentSystemPrompt(customer, await this.claimContext(session, customer)) },
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
