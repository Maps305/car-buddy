export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ASSESSOR_ASSIGNED'
  | 'ASSESSMENT_IN_PROGRESS'
  | 'ASSESSMENT_COMPLETED'
  | 'AWAITING_DECISION'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAYMENT_PENDING'
  | 'CLOSED';

export type StaffRole = 'PROCESSOR' | 'ASSESSOR' | 'ADMIN';

export type StaffAction =
  | 'start-review'
  | 'assign'
  | 'start-assessment'
  | 'submit-assessment'
  | 'request-info'
  | 'resume-review'
  | 'approve'
  | 'reject'
  | 'close';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface QueueItem {
  id: string;
  reference: string;
  status: ClaimStatus;
  accidentDate: string | null;
  accidentPlace: string | null;
  submittedAt: string | null;
  updatedAt: string;
  customerName: string;
  registration: string;
  vehicle: string;
  assessorName: string | null;
  needsHumanReview: boolean;
  sketchSkipped: boolean;
  unread: boolean;
  quotes: number;
}

export interface QuotationExtraction {
  isQuotation: boolean;
  reason: string;
  supplier: Field<string>;
  quoteDate: Field<string>;
  currency: Field<string>;
  total: Field<number>;
  vehicleRegistration: Field<string>;
  lineItems: { description: string; amount: number | null }[];
}

export interface Field<T = string | boolean> {
  value: T | null;
  confidence: number;
  sourceText: string | null;
}

export interface Party {
  position: 'FIRST' | 'SECOND' | 'THIRD';
  driverName: Field<string>;
  residentialAddress: Field<string>;
  contactNumber: Field<string>;
  vehicleMakeAndType: Field<string>;
  registrationNumber: Field<string>;
  insurer: Field<string>;
  policyNumber: Field<string>;
  registeredOwner: Field<string>;
  witness: Field<string>;
  injuries: Field<string>;
  passengerNames: Field<string>;
  vehicleDamage: Field<string>;
}

export interface PoliceReportExtraction {
  documentType: string;
  readability: 'GOOD' | 'PARTIAL' | 'POOR';
  tabNumber: Field<string>;
  place: Field<string>;
  dayOfWeek: Field<string>;
  accidentDate: Field<string>;
  accidentTime: Field<string>;
  placeOfOccurrence: Field<string>;
  parties: Party[];
  noCriminalActionContemplated: Field<boolean>;
  forwardedToPublicProsecutor: Field<boolean>;
  convictedPerson: Field<string>;
  convictedOf: Field<string>;
  depositFineAmount: Field<string>;
  depositFinePaidBy: Field<string>;
  depositFineFor: Field<string>;
  responsiblePartyIfNoCharge: Field<string>;
  officerName: Field<string>;
  officerRank: Field<string>;
  stationReported: Field<string>;
  reportDate: Field<string>;
  hasPoliceStamp: Field<boolean>;
  hasOfficerSignature: Field<boolean>;
  notes: string[];
}

export interface ReviewFlag {
  code: string;
  severity: 'INFO' | 'WARN' | 'BLOCKER';
  message: string;
}

export interface PoliceReportReview {
  fields: { field: string; status: 'OK' | 'LOW_CONFIDENCE' | 'MISSING' | 'INVALID'; reason?: string }[];
  flags: ReviewFlag[];
  insuredParty: Party['position'] | null;
  liability: {
    status: 'NO_CHARGE' | 'UNDER_INVESTIGATION' | 'CHARGED' | 'UNKNOWN';
    chargedPerson: string | null;
    insuredDriverCharged: boolean | null;
    responsiblePartyIfNoCharge: string | null;
  };
  needsHumanReview: boolean;
}

export interface ClaimDocument {
  id: string;
  type: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
  customerConfirmedAt: string | null;
  needsHumanReview: boolean | null;
  extractionModel: string | null;
  extraction: PoliceReportExtraction | null;
  review: PoliceReportReview | null;
}

export interface ClaimEvent {
  id: string;
  type: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus | null;
  actorType: string;
  actorName: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface ClaimIntake {
  driver?: 'INSURED' | 'OTHER';
  driverName?: string;
  driverPhone?: string;
  speedKmh?: number;
  weather?: string;
  description?: string;
  sketchSkipped?: boolean;
  quotesDone?: boolean;
  quotesLater?: boolean;
  declaredAt?: string;
}

export interface ClaimDetail {
  claim: {
    id: string;
    reference: string;
    status: ClaimStatus;
    accidentDate: string | null;
    accidentTime: string | null;
    accidentPlace: string | null;
    description: string | null;
    intake: ClaimIntake;
    submittedAt: string | null;
    createdAt: string;
  };
  customer: { firstName: string; surname: string; phone: string; email: string | null };
  policy: { policyNumber: string; coverType: string };
  vehicle: { registration: string; make: string; model: string; year: number | null; odometerKm: number | null };
  documents: ClaimDocument[];
  events: ClaimEvent[];
  assignment: { assessorId: string; assessorName: string; assignedAt: string } | null;
  assessment: {
    findings: string;
    damageDescription: string | null;
    estimatedCost: string | null;
    currency: string;
    recommendation: 'APPROVE' | 'REJECT' | 'MORE_INFO';
    createdAt: string;
    assessorName: string;
  } | null;
  allowedActions: StaffAction[];
}

export interface Assessor {
  id: string;
  name: string;
  email: string;
}
