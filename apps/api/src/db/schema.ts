import {
  boolean,
  date,
  numeric,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const coverType = pgEnum('cover_type', ['COMPREHENSIVE', 'FULL_THIRD_PARTY', 'THIRD_PARTY']);

export const CLAIM_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSESSOR_ASSIGNED',
  'ASSESSMENT_IN_PROGRESS',
  'ASSESSMENT_COMPLETED',
  'AWAITING_DECISION',
  'ADDITIONAL_INFO_REQUIRED',
  'APPROVED',
  'REJECTED',
  'PAYMENT_PENDING',
  'CLOSED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const claimStatus = pgEnum('claim_status', CLAIM_STATUSES);

export const documentType = pgEnum('document_type', [
  'POLICE_REPORT',
  'CLAIM_FORM',
  'DRIVER_LICENCE',
  'ID_COPY',
  'QUOTATION',
  'DAMAGE_PHOTO',
  'SKETCH',
  'OTHER',
]);

export interface ClaimIntake {
  driver?: 'INSURED' | 'OTHER';
  driverName?: string;
  driverPhone?: string;
  reportDriverName?: string;
  reportDriverPhone?: string;
  speedKmh?: number;
  weather?: string;
  description?: string;
  sketchSkipped?: boolean;
  damageDone?: boolean;
  quotesDone?: boolean;
  quotesLater?: boolean;
  declaredAt?: string;
}

export const actorType = pgEnum('actor_type', ['CUSTOMER', 'AGENT', 'STAFF', 'SYSTEM']);

export const sessionState = pgEnum('session_state', [
  'IDLE',
  'CHOOSING_VEHICLE',
  'AWAITING_POLICE_REPORT',
  'CONFIRMING_POLICE_REPORT',
  'COLLECTING_DETAILS',
]);

export const customers = pgTable('customers', {
  id: id(),
  phone: text('phone').notNull().unique(),
  firstName: text('first_name').notNull(),
  surname: text('surname').notNull(),
  email: text('email'),
  createdAt: createdAt(),
});

export const policies = pgTable(
  'policies',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    policyNumber: text('policy_number').notNull().unique(),
    coverType: coverType('cover_type').notNull(),
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('policies_customer_idx').on(t.customerId)],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    policyId: uuid('policy_id').references(() => policies.id),
    registration: text('registration').notNull().unique(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    year: integer('year'),
    odometerKm: integer('odometer_km'),
    lastServiceKm: integer('last_service_km'),
    serviceIntervalKm: integer('service_interval_km'),
    trackerId: text('tracker_id'),
    createdAt: createdAt(),
  },
  (t) => [index('vehicles_customer_idx').on(t.customerId)],
);

export const claims = pgTable(
  'claims',
  {
    id: id(),
    reference: text('reference').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    status: claimStatus('status').notNull().default('DRAFT'),
    accidentDate: date('accident_date', { mode: 'string' }),
    accidentTime: text('accident_time'),
    accidentPlace: text('accident_place'),
    description: text('description'),
    intake: jsonb('intake').$type<ClaimIntake>().notNull().default({}),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('claims_status_idx').on(t.status), index('claims_customer_idx').on(t.customerId)],
);

export const claimDocuments = pgTable(
  'claim_documents',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    type: documentType('type').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    whatsappMediaId: text('whatsapp_media_id'),
    extraction: jsonb('extraction'),
    review: jsonb('review'),
    extractionModel: text('extraction_model'),
    needsHumanReview: boolean('needs_human_review'),
    customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('claim_documents_claim_idx').on(t.claimId)],
);

export const claimEvents = pgTable(
  'claim_events',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    type: text('type').notNull(),
    fromStatus: claimStatus('from_status'),
    toStatus: claimStatus('to_status'),
    actorType: actorType('actor_type').notNull(),
    actorId: text('actor_id'),
    data: jsonb('data'),
    createdAt: createdAt(),
  },
  (t) => [index('claim_events_claim_idx').on(t.claimId, t.createdAt)],
);

export const conversationSessions = pgTable('conversation_sessions', {
  phone: text('phone').primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id),
  state: sessionState('state').notNull().default('IDLE'),
  activeClaimId: uuid('active_claim_id').references(() => claims.id),
  history: jsonb('history').notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const processedMessages = pgTable('processed_messages', {
  messageId: text('message_id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
});

export const staffRole = pgEnum('staff_role', ['PROCESSOR', 'ASSESSOR', 'ADMIN']);
export type StaffRole = (typeof staffRole.enumValues)[number];

export const staffUsers = pgTable('staff_users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: staffRole('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const claimAssignments = pgTable(
  'claim_assignments',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    assessorId: uuid('assessor_id')
      .notNull()
      .references(() => staffUsers.id),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => staffUsers.id),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('claim_assignments_claim_idx').on(t.claimId), index('claim_assignments_assessor_idx').on(t.assessorId)],
);

export const assessmentRecommendation = pgEnum('assessment_recommendation', ['APPROVE', 'REJECT', 'MORE_INFO']);

export const claimAssessments = pgTable(
  'claim_assessments',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    assessorId: uuid('assessor_id')
      .notNull()
      .references(() => staffUsers.id),
    findings: text('findings').notNull(),
    damageDescription: text('damage_description'),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    recommendation: assessmentRecommendation('recommendation').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('claim_assessments_claim_idx').on(t.claimId)],
);

export const claimViews = pgTable(
  'claim_views',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUsers.id),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.claimId] })],
);
