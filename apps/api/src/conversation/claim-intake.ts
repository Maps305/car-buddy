import type { ClaimIntake } from '../db/schema';

export type IntakeStep =
  | 'DRIVER'
  | 'DRIVER_DETAILS'
  | 'LICENCE_FRONT'
  | 'LICENCE_BACK'
  | 'ID'
  | 'SPEED'
  | 'WEATHER'
  | 'DESCRIPTION'
  | 'SKETCH'
  | 'DAMAGE'
  | 'QUOTATIONS'
  | 'DECLARATION';

export interface IntakeDocs {
  licence: number;
  id: number;
  sketch: number;
  damage: number;
  quotes: number;
}

export const QUOTES_WANTED = 3;

export interface Button {
  id: string;
  title: string;
}

export interface Prompt {
  text: string;
  buttons?: Button[];
}

export const PHOTO_STEPS: ReadonlySet<IntakeStep> = new Set([
  'LICENCE_FRONT',
  'LICENCE_BACK',
  'ID',
  'SKETCH',
  'DAMAGE',
  'QUOTATIONS',
]);

export const INTAKE_BUTTONS = {
  driverMe: { id: 'intake:driver_me', title: 'It was me' },
  driverOther: { id: 'intake:driver_other', title: 'Someone else' },
  clear: { id: 'intake:weather_clear', title: 'Clear' },
  rain: { id: 'intake:weather_rain', title: 'Rain' },
  fog: { id: 'intake:weather_fog', title: 'Fog or dust' },
  skipSketch: { id: 'intake:skip_sketch', title: 'Skip sketch' },
  damageDone: { id: 'intake:damage_done', title: 'Done' },
  quotesLater: { id: 'intake:quotes_later', title: 'Send later' },
  quotesDone: { id: 'intake:quotes_done', title: 'Done' },
  declare: { id: 'intake:declare', title: 'I confirm' },
} satisfies Record<string, Button>;

export const WEATHER_BY_BUTTON: Record<string, string> = {
  [INTAKE_BUTTONS.clear.id]: 'Clear',
  [INTAKE_BUTTONS.rain.id]: 'Rain',
  [INTAKE_BUTTONS.fog.id]: 'Fog or dust',
};

export const DECLARATION_TEXT =
  'Insurance fraud is a crime. I declare that the information I have given is true and complete to the best of my knowledge.';

export function nextStep(i: ClaimIntake, d: IntakeDocs): IntakeStep | null {
  if (!i.driver) return 'DRIVER';
  if (i.driver === 'OTHER' && (!i.driverName || !i.driverPhone)) return 'DRIVER_DETAILS';
  if (d.licence < 1) return 'LICENCE_FRONT';
  if (d.licence < 2) return 'LICENCE_BACK';
  if (d.id < 1) return 'ID';
  if (i.speedKmh === undefined) return 'SPEED';
  if (!i.weather) return 'WEATHER';
  if (!i.description) return 'DESCRIPTION';
  if (d.sketch < 1 && !i.sketchSkipped) return 'SKETCH';
  if (!i.damageDone) return 'DAMAGE';
  if (!i.quotesDone && !i.quotesLater && d.quotes < QUOTES_WANTED) return 'QUOTATIONS';
  if (!i.declaredAt) return 'DECLARATION';
  return null;
}

interface PromptContext {
  reference: string;
  registration: string;
  intake: ClaimIntake;
  docs: IntakeDocs;
}

const licenceOwner = (i: ClaimIntake) => (i.driver === 'OTHER' ? `${i.driverName ?? 'the driver'}'s` : 'your');

export function intakePrompt(step: IntakeStep, c: PromptContext): Prompt {
  const i = c.intake;
  switch (step) {
    case 'DRIVER':
      return {
        text: i.reportDriverName
          ? `The police report says *${i.reportDriverName}* was driving. Was that you?`
          : 'Who was driving when the accident happened?',
        buttons: [INTAKE_BUTTONS.driverMe, INTAKE_BUTTONS.driverOther],
      };
    case 'DRIVER_DETAILS':
      return {
        text: i.driverName
          ? `What is *${i.driverName}*'s phone number? Reply *skip* if you don't have it.`
          : "Please send the driver's full name and phone number, for example: *Rudo Moyo 0772 123 456*",
      };
    case 'LICENCE_FRONT':
      return { text: `Please send a photo of the *front* of ${licenceOwner(i)} driver's licence.` };
    case 'LICENCE_BACK':
      return { text: 'Thanks. Now send the *back* of the licence.' };
    case 'ID':
      return { text: 'Please send a photo of your national ID. A passport also works.' };
    case 'SPEED':
      return { text: 'Roughly how fast was the vehicle going when the accident happened? Reply with a number in km/h, for example *40*.' };
    case 'WEATHER':
      return { text: 'What was the weather like?', buttons: [INTAKE_BUTTONS.clear, INTAKE_BUTTONS.rain, INTAKE_BUTTONS.fog] };
    case 'DESCRIPTION':
      return {
        text: 'In your own words, what happened? A few sentences are enough: where you were going, what the other vehicle did, and where your vehicle was hit.',
      };
    case 'SKETCH':
      return {
        text: [
          'Please draw a simple sketch of the accident on paper and send a photo of it:',
          '• the road and any junction',
          '• each vehicle as a box, with an arrow for the way it was going',
          '• where they hit',
        ].join('\n'),
        buttons: [INTAKE_BUTTONS.skipSketch],
      };
    case 'DAMAGE':
      return {
        text:
          c.docs.damage > 0
            ? `I have ${c.docs.damage} damage photo${c.docs.damage === 1 ? '' : 's'}. Send more, or tap *Done*.`
            : 'Last photos: send pictures of the damage to your vehicle, one from each side plus close-ups. Tap *Done* when you have sent them all.',
        buttons: [INTAKE_BUTTONS.damageDone],
      };
    case 'QUOTATIONS':
      return c.docs.quotes > 0
        ? {
            text: `I have ${c.docs.quotes} of ${QUOTES_WANTED} quotations. Send the next one, or tap *Done* and send the rest to the claims team later.`,
            buttons: [INTAKE_BUTTONS.quotesDone],
          }
        : {
            text: `Moovah asks for ${QUOTES_WANTED} quotations for the repair, from different garages or suppliers. If you have any, send a photo or PDF of each.\n\nNo quotations yet? Tap *Send later*. You can send them to the claims team afterwards.`,
            buttons: [INTAKE_BUTTONS.quotesLater],
          };
    case 'DECLARATION':
      return { text: declarationSummary(c), buttons: [INTAKE_BUTTONS.declare] };
  }
}

function declarationSummary(c: PromptContext): string {
  const i = c.intake;
  const story = i.description && i.description.length > 300 ? `${i.description.slice(0, 297)}…` : i.description;
  return [
    `*Please check claim ${c.reference}:*`,
    `• Vehicle: ${c.registration}`,
    `• Driver: ${i.driver === 'OTHER' ? `${i.driverName}${i.driverPhone && i.driverPhone !== 'Not given' ? `, ${i.driverPhone}` : ''}` : 'you'}`,
    `• Speed: ${i.speedKmh} km/h`,
    `• Weather: ${i.weather}`,
    `• What happened: ${story}`,
    `• Sketch: ${i.sketchSkipped ? 'skipped' : 'sent'}`,
    `• Photos: licence front and back, ID, ${c.docs.damage} of the damage`,
    `• Quotations: ${c.docs.quotes} of ${QUOTES_WANTED}${c.docs.quotes < QUOTES_WANTED ? ', the rest to follow' : ''}`,
    '',
    '*Insurance fraud is a crime.* Tap *I confirm* to declare that this information is true and complete to the best of your knowledge.',
  ].join('\n');
}

const PHONE = /(\+?263|0)\s?7\d(?:[\s-]?\d){7}/;

export function parseDriverDetails(text: string, knownName?: string): { name?: string; phone?: string } | null {
  const t = text.trim();
  if (/^(skip|don'?t know|not sure|no)\b/i.test(t)) return knownName ? { name: knownName, phone: 'Not given' } : null;
  const phone = t.match(PHONE)?.[0].replace(/[\s-]/g, '');
  const name = (knownName ?? t.replace(PHONE, '').replace(/[,.;:]+/g, ' ').replace(/\s+/g, ' ').trim()) || undefined;
  if (!phone || !name || name.length < 3) return null;
  return { name, phone };
}

export function parseSpeed(text: string): number | null {
  const m = text.match(/\d{1,3}/);
  if (!m) return null;
  const n = Number(m[0]);
  return n <= 250 ? n : null;
}

export function parseDriverAnswer(text: string): 'INSURED' | 'OTHER' | null {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yebo|me|i was|it was me|myself)\b/.test(t)) return 'INSURED';
  if (/^(no|someone|somebody|another|my )|\bsomeone else\b/.test(t)) return 'OTHER';
  return null;
}

export function parseWeather(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (/clear|sunny|dry|fine|good/.test(t)) return 'Clear';
  if (/rain|wet|storm|drizzle/.test(t)) return 'Rain';
  if (/fog|mist|dust|smoke|haze/.test(t)) return 'Fog or dust';
  return t.length > 1 && t.length <= 40 && !t.includes('?') ? text.trim() : null;
}
