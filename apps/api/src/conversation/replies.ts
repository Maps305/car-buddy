import type { Customer } from '../customers/customer.directory';
import type { PoliceReportResult } from '../extraction/extraction.service';

export const EMERGENCY_LINE = 'If anyone is hurt or in danger, call 999 (or 994 for an ambulance) before anything else.';

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

export function claimStarted(customer: Customer, reference: string, registration: string): string {
  return [
    `Sorry to hear about the accident, ${customer.firstName}. ${EMERGENCY_LINE}`,
    '',
    `I've opened claim *${reference}* for *${registration}*.`,
    '',
    'Please send a clear photo of the completed *Moovah Motor Accident Police Report*, stamped by the police. Lay it flat in good light with all four corners visible. A PDF also works.',
  ].join('\n');
}

export function policeReportSummary(result: PoliceReportResult): string {
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
