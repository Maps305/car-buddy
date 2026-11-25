import type { Customer, InsuredVehicle } from '../customers/customer.directory';
import type { PoliceReportResult } from '../extraction/extraction.service';

export const EMERGENCY_LINE = 'If anyone is hurt or in danger, call 999 (or 112 from an Econet line) before anything else.';

const FIELD_LABELS: Record<string, string> = {
  tabNumber: 'TAB number',
  accidentDate: 'date of accident',
  accidentTime: 'time of accident',
  placeOfOccurrence: 'place of occurrence',
  stationReported: 'police station',
  reportDate: 'date of report',
  hasPoliceStamp: 'police stamp',
  officerName: 'officer name',
};

const CUSTOMER_FACING_FLAGS = new Set([
  'MISSING_REQUIRED_FIELD',
  'INVALID_FIELD',
  'POOR_READABILITY',
  'NOT_MOOVAH_FORM',
  'INSURED_VEHICLE_NOT_ON_REPORT',
  'NO_STAMP',
  'NO_PARTIES',
]);

const label = (field: string) => {
  const key = field.split('.').pop() ?? field;
  const party = field.startsWith('parties.') ? `${field.split('.')[1].toLowerCase()} party ` : '';
  return party + (FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').toLowerCase());
};

export function claimStarted(customer: Customer, reference: string, registration: string, greet = true): string {
  return [
    ...(greet ? [`Sorry to hear about the accident, ${customer.firstName}. ${EMERGENCY_LINE}`, ''] : []),
    `I've opened claim *${reference}* for *${registration}*.`,
    '',
    'Please send a clear photo of the completed *Moovah Motor Accident Police Report*, stamped by the police. Lay it flat in good light with all four corners visible. A PDF also works.',
    '',
    `No form yet? Download it, print it and take it to the police station where the accident was reported: ${POLICE_REPORT_FORM_URL}`,
  ].join('\n');
}

export function policeReportSummary(result: Pick<PoliceReportResult, 'extraction' | 'review'>): string {
  const { extraction: x, review } = result;
  if (review.flags.some((f) => f.code === 'NOT_A_POLICE_REPORT' || f.code === 'UNREADABLE_DOCUMENT')) {
    return "That doesn't look like a readable police report. Please send a photo of the Moovah Motor Accident Police Report, flat and in good light.";
  }

  const lines = ['*Here is what I read from your police report:*'];
  if (x.tabNumber.value) lines.push(`• TAB number: ${x.tabNumber.value}`);
  if (x.stationReported.value) lines.push(`• Station: ${x.stationReported.value}`);
  const when = [x.accidentDate.value, x.accidentTime.value].filter(Boolean).join(' at ');
  if (when) lines.push(`• Accident: ${when}`);
  if (x.placeOfOccurrence.value) lines.push(`• Place: ${x.placeOfOccurrence.value}`);
  for (const p of x.parties) {
    const vehicle = [p.vehicleMakeAndType.value, p.registrationNumber.value].filter(Boolean).join(' ');
    const mine = review.insuredParty === p.position ? ' (your vehicle)' : '';
    lines.push(`• ${p.position.toLowerCase()} party${mine}: ${p.driverName.value ?? 'driver not read'}${vehicle ? `, ${vehicle}` : ''}`);
  }

  const issues = [
    ...review.flags.filter((f) => CUSTOMER_FACING_FLAGS.has(f.code)).map((f) => f.message),
    ...review.fields.filter((f) => f.status === 'LOW_CONFIDENCE').map((f) => `I couldn't read the ${label(f.field)} clearly`),
  ];
  if (issues.length) {
    lines.push('', '*Please check:*', ...issues.slice(0, 6).map((i) => `• ${i}`));
  }
  lines.push('', 'Is this correct?');
  return lines.join('\n');
}

export function policeReportConfirmed(reference: string): string {
  return [
    `Thanks. Your police report is saved to claim *${reference}*.`,
    'A Moovah claims processor will review it. I will message you here when there is an update.',
  ].join('\n');
}

export const POLICE_REPORT_FORM_URL =
  'https://moovah.co.zw/wp-content/uploads/2026/03/D1-117597-MOOVAH-MOTOR-ACCIDENT-POLICE-REPORT.pdf';

export function chooseVehicle(customer: Customer): string {
  const lines = [`Sorry to hear about the accident, ${customer.firstName}. ${EMERGENCY_LINE}`, '', 'Which vehicle is this claim for?'];
  if (customer.vehicles.length > 3) {
    lines.push('Reply with its registration:', ...customer.vehicles.map((v) => `• ${v.registration} (${v.make} ${v.model})`));
  }
  return lines.join('\n');
}

export function claimResume(reference: string, registration: string, waitingFor: 'POLICE_REPORT' | 'CONFIRMATION'): string {
  const next =
    waitingFor === 'CONFIRMATION'
      ? 'Please confirm the police report details I sent, or tap *Send again* to send a new photo.'
      : [
          'I still need a photo of the *Moovah Motor Accident Police Report*, completed and stamped by the police. Send it whenever you have it.',
          `No form yet? Download it here, print it and take it to the police station where the accident was reported: ${POLICE_REPORT_FORM_URL}`,
        ].join('\n\n');
  return [`You already have claim *${reference}* open for *${registration}*.`, '', next, '', 'To close this claim instead, send *cancel*.'].join('\n');
}

export const vehicleLabel = (v: InsuredVehicle) => `${v.registration} (${v.make} ${v.model})`;
