import type { ExtractedField, ExtractedParty, PoliceReportExtraction } from './police-report.schema';

export type FieldStatus = 'OK' | 'LOW_CONFIDENCE' | 'MISSING' | 'INVALID';
export type FlagSeverity = 'INFO' | 'WARN' | 'BLOCKER';
export type LiabilityStatus = 'NO_CHARGE' | 'UNDER_INVESTIGATION' | 'CHARGED' | 'UNKNOWN';

export interface FieldCheck {
  field: string;
  status: FieldStatus;
  value: string | boolean | null;
  confidence: number;
  reason?: string;
}

export interface ReviewFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

export interface LiabilitySummary {
  status: LiabilityStatus;
  chargedPerson: string | null;
  insuredDriverCharged: boolean | null;
  responsiblePartyIfNoCharge: string | null;
}

export interface PoliceReportReview {
  fields: FieldCheck[];
  flags: ReviewFlag[];
  insuredParty: ExtractedParty['position'] | null;
  liability: LiabilitySummary;
  needsHumanReview: boolean;
}

export interface ClaimContext {
  insuredRegistration: string;
  insuredPolicyNumber?: string;
  reportedAccidentDate?: string;
  now?: Date;
}

export const REVIEW_SETTINGS = {
  minConfidence: 0.75,
  maxReportDelayDays: 2,
};

const REQUIRED = new Set(['tabNumber', 'accidentDate', 'placeOfOccurrence', 'stationReported', 'hasPoliceStamp']);
const DATE_FIELDS = new Set(['accidentDate', 'reportDate', 'courtDate']);
const SCALAR_FIELDS = [
  'tabNumber',
  'place',
  'dayOfWeek',
  'accidentDate',
  'accidentTime',
  'placeOfOccurrence',
  'noCriminalActionContemplated',
  'forwardedToPublicProsecutor',
  'magistratesCourt',
  'courtDate',
  'convictedPerson',
  'convictedOf',
  'depositFineAmount',
  'depositFinePaidBy',
  'depositFineFor',
  'responsiblePartyIfNoCharge',
  'officerName',
  'officerRank',
  'officerContact',
  'stationReported',
  'reportDate',
  'hasPoliceStamp',
  'hasOfficerSignature',
] as const satisfies readonly (keyof PoliceReportExtraction)[];
const PARTY_FIELDS = ['driverName', 'registrationNumber', 'policyNumber'] as const;

const ZIM_PLATE = /^[A-Z]{3}\s?\d{4}$/;
const NO_INJURY = /^(nil|none|no|n\/a|na|-)$/i;
const DAY_MS = 86_400_000;

const normaliseId = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const nameTokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length > 2),
  );
const namesOverlap = (a: string, b: string) => [...nameTokens(a)].some((t) => nameTokens(b).has(t));

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function checkField(name: string, f: ExtractedField, now: Date): FieldCheck {
  const base = { field: name, value: f.value, confidence: f.confidence };
  if (f.value === null || f.value === '') return { ...base, status: 'MISSING' };
  const key = name.split('.').pop() ?? name;
  if (DATE_FIELDS.has(key)) {
    const date = parseIsoDate(String(f.value));
    if (!date) return { ...base, status: 'INVALID', reason: 'Not a valid YYYY-MM-DD date' };
    if (date.getTime() > now.getTime()) return { ...base, status: 'INVALID', reason: 'Date is in the future' };
  }
  if (key === 'accidentTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(f.value))) {
    return { ...base, status: 'INVALID', reason: 'Not a valid HH:MM time' };
  }
  if (f.confidence < REVIEW_SETTINGS.minConfidence) return { ...base, status: 'LOW_CONFIDENCE' };
  return { ...base, status: 'OK' };
}

function summariseLiability(x: PoliceReportExtraction, insured: ExtractedParty | undefined): LiabilitySummary {
  const chargedPerson = x.convictedPerson.value ?? x.depositFinePaidBy.value;
  const status: LiabilityStatus = chargedPerson
    ? 'CHARGED'
    : x.forwardedToPublicProsecutor.value === true
      ? 'UNDER_INVESTIGATION'
      : x.noCriminalActionContemplated.value === true
        ? 'NO_CHARGE'
        : 'UNKNOWN';
  const insuredDriver = insured?.driverName.value;
  return {
    status,
    chargedPerson,
    insuredDriverCharged: chargedPerson && insuredDriver ? namesOverlap(chargedPerson, insuredDriver) : null,
    responsiblePartyIfNoCharge: x.responsiblePartyIfNoCharge.value,
  };
}

const UNKNOWN_LIABILITY: LiabilitySummary = {
  status: 'UNKNOWN',
  chargedPerson: null,
  insuredDriverCharged: null,
  responsiblePartyIfNoCharge: null,
};

export function reviewPoliceReport(x: PoliceReportExtraction, ctx: ClaimContext): PoliceReportReview {
  const now = ctx.now ?? new Date();
  const flags: ReviewFlag[] = [];

  if (x.documentType === 'OTHER_DOCUMENT' || x.documentType === 'UNREADABLE') {
    flags.push({
      code: x.documentType === 'UNREADABLE' ? 'UNREADABLE_DOCUMENT' : 'NOT_A_POLICE_REPORT',
      severity: 'BLOCKER',
      message: x.documentTypeReason,
    });
    return { fields: [], flags, insuredParty: null, liability: UNKNOWN_LIABILITY, needsHumanReview: true };
  }

  if (x.documentType === 'OTHER_POLICE_REPORT') {
    flags.push({ code: 'NOT_MOOVAH_FORM', severity: 'WARN', message: 'Police report is not on the Moovah D1 form' });
  }
  if (x.readability === 'POOR') {
    flags.push({ code: 'POOR_READABILITY', severity: 'WARN', message: 'Document is hard to read; ask for a clearer photo' });
  }

  const fields = SCALAR_FIELDS.map((name) => checkField(name, x[name], now));
  for (const p of x.parties) {
    for (const key of PARTY_FIELDS) fields.push(checkField(`parties.${p.position}.${key}`, p[key], now));
    const plate = p.registrationNumber.value;
    if (plate && !ZIM_PLATE.test(plate)) {
      flags.push({
        code: 'UNUSUAL_PLATE_FORMAT',
        severity: 'INFO',
        message: `${p.position} party plate "${plate}" does not match the AAA 1234 format`,
      });
    }
    if (p.injuries.value && !NO_INJURY.test(p.injuries.value.trim())) {
      flags.push({ code: 'INJURIES_REPORTED', severity: 'INFO', message: `${p.position} party: ${p.injuries.value}` });
    }
  }

  for (const f of fields) {
    if (f.status === 'MISSING' && REQUIRED.has(f.field)) {
      flags.push({ code: 'MISSING_REQUIRED_FIELD', severity: 'BLOCKER', message: `${f.field} is missing` });
    } else if (f.status === 'INVALID') {
      flags.push({ code: 'INVALID_FIELD', severity: 'WARN', message: `${f.field}: ${f.reason}` });
    }
  }

  if (x.parties.length === 0) {
    flags.push({ code: 'NO_PARTIES', severity: 'BLOCKER', message: 'No parties found on the report' });
  }
  if (x.hasPoliceStamp.value === false) {
    flags.push({ code: 'NO_STAMP', severity: 'WARN', message: 'No police stamp visible' });
  }

  const accident = x.accidentDate.value ? parseIsoDate(x.accidentDate.value) : null;
  const reported = x.reportDate.value ? parseIsoDate(x.reportDate.value) : null;
  if (accident && reported) {
    const delayDays = (reported.getTime() - accident.getTime()) / DAY_MS;
    if (delayDays < 0) {
      flags.push({ code: 'REPORT_BEFORE_ACCIDENT', severity: 'WARN', message: 'Report date is before the accident date' });
    } else if (delayDays > REVIEW_SETTINGS.maxReportDelayDays) {
      flags.push({ code: 'LATE_REPORT', severity: 'WARN', message: `Reported ${delayDays} days after the accident` });
    }
  }
  if (accident && ctx.reportedAccidentDate && x.accidentDate.value !== ctx.reportedAccidentDate) {
    flags.push({
      code: 'ACCIDENT_DATE_MISMATCH',
      severity: 'WARN',
      message: `Customer said ${ctx.reportedAccidentDate}; report says ${x.accidentDate.value}`,
    });
  }

  const insuredPlate = normaliseId(ctx.insuredRegistration);
  const insured = x.parties.find(
    (p) => p.registrationNumber.value && normaliseId(p.registrationNumber.value) === insuredPlate,
  );
  if (!insured && x.parties.length > 0) {
    const plates = x.parties.map((p) => p.registrationNumber.value ?? '?').join(', ');
    flags.push({
      code: 'INSURED_VEHICLE_NOT_ON_REPORT',
      severity: 'WARN',
      message: `Insured vehicle ${ctx.insuredRegistration} not found among ${plates}`,
    });
  }
  if (insured && ctx.insuredPolicyNumber && insured.policyNumber.value) {
    if (normaliseId(insured.policyNumber.value) !== normaliseId(ctx.insuredPolicyNumber)) {
      flags.push({
        code: 'POLICY_NUMBER_MISMATCH',
        severity: 'WARN',
        message: `Report shows policy ${insured.policyNumber.value}; policy on file is ${ctx.insuredPolicyNumber}`,
      });
    }
  }

  const liability = summariseLiability(x, insured);
  if (liability.insuredDriverCharged) {
    flags.push({
      code: 'INSURED_DRIVER_CHARGED',
      severity: 'INFO',
      message: `Police record a charge or fine against ${liability.chargedPerson}, who appears to be the insured's driver`,
    });
  }

  const needsHumanReview =
    flags.some((f) => f.severity !== 'INFO') || fields.some((f) => f.status === 'LOW_CONFIDENCE');

  return { fields, flags, insuredParty: insured?.position ?? null, liability, needsHumanReview };
}
