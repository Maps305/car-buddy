import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { claimMessages } from '../claims/claim-messages';
import { ClaimNotifier } from '../claims/claim-notifier';
import { InvalidTransitionError, type Actor } from '../claims/claim-transitions';
import { ClaimsService } from '../claims/claims.service';
import { DB, type Database } from '../db/db.module';
import {
  CLAIM_STATUSES,
  claimAssessments,
  claimAssignments,
  claimDocuments,
  claimEvents,
  claims,
  customers,
  policies,
  staffUsers,
  vehicles,
  type ClaimStatus,
} from '../db/schema';
import { MediaStore } from '../media/media.store';
import type { StaffPrincipal } from './staff-auth';

export const STAFF_ACTIONS = [
  'start-review',
  'assign',
  'start-assessment',
  'submit-assessment',
  'request-info',
  'resume-review',
  'approve',
  'reject',
  'close',
] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

const note = z.string().trim().max(2000);
const bodies = {
  assign: z.object({ assessorId: z.uuid() }),
  'submit-assessment': z.object({
    findings: z.string().trim().min(10).max(5000),
    damageDescription: z.string().trim().max(5000).optional(),
    estimatedCost: z.coerce.number().nonnegative().max(10_000_000).optional(),
    recommendation: z.enum(['APPROVE', 'REJECT', 'MORE_INFO']),
  }),
  'request-info': z.object({ note: note.min(3) }),
  approve: z.object({
    settlement: z.enum(['REPAIR', 'CASH']),
    garage: z.string().trim().max(200).optional(),
    note: note.optional(),
  }),
  reject: z.object({ note: note.min(3) }),
} satisfies Partial<Record<StaffAction, z.ZodType>>;

const isProcessor = (s: StaffPrincipal) => s.role === 'PROCESSOR' || s.role === 'ADMIN';

@Injectable()
export class StaffClaimsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly claims: ClaimsService,
    private readonly media: MediaStore,
    private readonly notifier: ClaimNotifier,
  ) {}

  async queue(staff: StaffPrincipal, statuses: ClaimStatus[], mineOnly: boolean) {
    const assessor = this.db
      .select({ claimId: claimAssignments.claimId, assessorId: claimAssignments.assessorId, name: staffUsers.name })
      .from(claimAssignments)
      .innerJoin(staffUsers, eq(staffUsers.id, claimAssignments.assessorId))
      .where(eq(claimAssignments.active, true))
      .as('assessor');

    const filters = [];
    if (statuses.length) filters.push(inArray(claims.status, statuses));
    else filters.push(sql`${claims.status} <> 'DRAFT'`);
    if (mineOnly || staff.role === 'ASSESSOR') filters.push(eq(assessor.assessorId, staff.id));

    return this.db
      .select({
        id: claims.id,
        reference: claims.reference,
        status: claims.status,
        accidentDate: claims.accidentDate,
        accidentPlace: claims.accidentPlace,
        submittedAt: claims.submittedAt,
        updatedAt: claims.updatedAt,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.surname}`,
        registration: vehicles.registration,
        vehicle: sql<string>`${vehicles.make} || ' ' || ${vehicles.model}`,
        assessorName: assessor.name,
        needsHumanReview: sql<boolean>`exists (select 1 from ${claimDocuments} d where d.claim_id = ${claims.id} and d.needs_human_review)`,
      })
      .from(claims)
      .innerJoin(customers, eq(customers.id, claims.customerId))
      .innerJoin(vehicles, eq(vehicles.id, claims.vehicleId))
      .leftJoin(assessor, eq(assessor.claimId, claims.id))
      .where(and(...filters))
      .orderBy(desc(claims.updatedAt));
  }

  async detail(staff: StaffPrincipal, claimId: string) {
    const [row] = await this.db
      .select({ claim: claims, customer: customers, policy: policies, vehicle: vehicles })
      .from(claims)
      .innerJoin(customers, eq(customers.id, claims.customerId))
      .innerJoin(policies, eq(policies.id, claims.policyId))
      .innerJoin(vehicles, eq(vehicles.id, claims.vehicleId))
      .where(eq(claims.id, claimId))
      .limit(1);
    if (!row || row.claim.status === 'DRAFT') throw new NotFoundException('Claim not found');

    const assignment = await this.activeAssignment(claimId);
    if (staff.role === 'ASSESSOR' && assignment?.assessorId !== staff.id) {
      throw new ForbiddenException('This claim is not assigned to you');
    }

    const [documents, events, [assessment], staffNames] = await Promise.all([
      this.db
        .select({
          id: claimDocuments.id,
          type: claimDocuments.type,
          mimeType: claimDocuments.mimeType,
          bytes: claimDocuments.bytes,
          createdAt: claimDocuments.createdAt,
          customerConfirmedAt: claimDocuments.customerConfirmedAt,
          needsHumanReview: claimDocuments.needsHumanReview,
          extractionModel: claimDocuments.extractionModel,
          extraction: claimDocuments.extraction,
          review: claimDocuments.review,
        })
        .from(claimDocuments)
        .where(eq(claimDocuments.claimId, claimId))
        .orderBy(desc(claimDocuments.createdAt)),
      this.db.select().from(claimEvents).where(eq(claimEvents.claimId, claimId)).orderBy(asc(claimEvents.createdAt)),
      this.db
        .select({
          id: claimAssessments.id,
          findings: claimAssessments.findings,
          damageDescription: claimAssessments.damageDescription,
          estimatedCost: claimAssessments.estimatedCost,
          currency: claimAssessments.currency,
          recommendation: claimAssessments.recommendation,
          createdAt: claimAssessments.createdAt,
          assessorName: staffUsers.name,
        })
        .from(claimAssessments)
        .innerJoin(staffUsers, eq(staffUsers.id, claimAssessments.assessorId))
        .where(eq(claimAssessments.claimId, claimId))
        .orderBy(desc(claimAssessments.createdAt))
        .limit(1),
      this.db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers),
    ]);

    const names = new Map(staffNames.map((s) => [s.id, s.name]));
    const actorName = (type: string, id: string | null) =>
      type === 'STAFF' ? (names.get(id ?? '') ?? 'Staff') : type === 'CUSTOMER' ? 'Customer (WhatsApp)' : 'System';

    return {
      claim: row.claim,
      customer: {
        firstName: row.customer.firstName,
        surname: row.customer.surname,
        phone: row.customer.phone,
        email: row.customer.email,
      },
      policy: { policyNumber: row.policy.policyNumber, coverType: row.policy.coverType },
      vehicle: row.vehicle,
      documents,
      events: events.map((e) => ({ ...e, actorName: actorName(e.actorType, e.actorId) })),
      assignment,
      assessment: assessment ?? null,
      allowedActions: this.allowedActions(staff, row.claim.status, assignment?.assessorId === staff.id),
    };
  }

  async assessors() {
    return this.db
      .select({ id: staffUsers.id, name: staffUsers.name, email: staffUsers.email })
      .from(staffUsers)
      .where(and(eq(staffUsers.role, 'ASSESSOR'), eq(staffUsers.active, true)))
      .orderBy(asc(staffUsers.name));
  }

  async documentFile(staff: StaffPrincipal, claimId: string, documentId: string) {
    await this.detail(staff, claimId);
    const [doc] = await this.db
      .select({ storageKey: claimDocuments.storageKey, mimeType: claimDocuments.mimeType })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.claimId, claimId)))
      .limit(1);
    if (!doc) throw new NotFoundException('Document not found');
    return { data: await this.media.read(doc.storageKey), mimeType: doc.mimeType };
  }

  async act(staff: StaffPrincipal, claimId: string, action: StaffAction, rawBody: unknown) {
    const claim = await this.claims.get(claimId);
    const assignment = await this.activeAssignment(claimId);
    if (!this.allowedActions(staff, claim.status, assignment?.assessorId === staff.id).includes(action)) {
      throw new ForbiddenException(`You can't ${action.replace('-', ' ')} this claim while it is ${claim.status}`);
    }
    const actor: Actor = { type: 'STAFF', id: staff.id };

    try {
      switch (action) {
        case 'start-review': {
          const updated = await this.claims.transition(claimId, 'UNDER_REVIEW', actor);
          await this.notifier.notify(claimId, claimMessages.reviewStarted);
          return updated;
        }
        case 'resume-review':
          return await this.claims.resumeAfterInfo(claimId, actor);
        case 'start-assessment':
          return await this.claims.transition(claimId, 'ASSESSMENT_IN_PROGRESS', actor);
        case 'close':
          return await this.claims.transition(claimId, 'CLOSED', actor);
        case 'assign': {
          const { assessorId } = parse(bodies.assign, rawBody);
          const [assessor] = await this.db
            .select()
            .from(staffUsers)
            .where(and(eq(staffUsers.id, assessorId), eq(staffUsers.role, 'ASSESSOR'), eq(staffUsers.active, true)));
          if (!assessor) throw new BadRequestException('Choose an active assessor');
          const assigned = await this.db.transaction(async (tx) => {
            await tx.update(claimAssignments).set({ active: false }).where(eq(claimAssignments.claimId, claimId));
            await tx.insert(claimAssignments).values({ claimId, assessorId, assignedBy: staff.id });
            return this.claims.transition(
              claimId,
              'ASSESSOR_ASSIGNED',
              actor,
              { assessorId, assessorName: assessor.name },
              tx,
            );
          });
          await this.notifier.notify(claimId, claimMessages.assessorAssigned);
          return assigned;
        }
        case 'submit-assessment': {
          const body = parse(bodies['submit-assessment'], rawBody);
          return await this.db.transaction(async (tx) => {
            await tx.insert(claimAssessments).values({
              claimId,
              assessorId: staff.id,
              findings: body.findings,
              damageDescription: body.damageDescription || null,
              estimatedCost: body.estimatedCost === undefined ? null : body.estimatedCost.toFixed(2),
              recommendation: body.recommendation,
            });
            await this.claims.transition(
              claimId,
              'ASSESSMENT_COMPLETED',
              actor,
              { recommendation: body.recommendation, estimatedCost: body.estimatedCost },
              tx,
            );
            return this.claims.transition(claimId, 'AWAITING_DECISION', { type: 'SYSTEM' }, undefined, tx);
          });
        }
        case 'request-info': {
          const body = parse(bodies['request-info'], rawBody);
          const updated = await this.claims.transition(claimId, 'ADDITIONAL_INFO_REQUIRED', actor, { note: body.note });
          await this.notifier.notify(claimId, (c) => claimMessages.infoRequired(c, body.note));
          return updated;
        }
        case 'approve': {
          const body = parse(bodies.approve, rawBody);
          if (body.settlement === 'REPAIR' && !body.garage) throw new BadRequestException('Name the repairing garage');
          const updated = await this.claims.transition(claimId, 'APPROVED', actor, body);
          await this.notifier.notify(claimId, (c) => claimMessages.approved(c, body));
          return updated;
        }
        case 'reject': {
          const body = parse(bodies.reject, rawBody);
          const updated = await this.claims.transition(claimId, 'REJECTED', actor, { note: body.note });
          await this.notifier.notify(claimId, (c) => claimMessages.rejected(c, body.note));
          return updated;
        }
      }
    } catch (err) {
      if (err instanceof InvalidTransitionError) throw new ConflictException(err.message);
      throw err;
    }
  }

  allowedActions(staff: StaffPrincipal, status: ClaimStatus, assignedToMe: boolean): StaffAction[] {
    const processor = isProcessor(staff);
    const assessor = staff.role === 'ASSESSOR' && assignedToMe;
    const actions: StaffAction[] = [];
    if (processor) {
      if (status === 'SUBMITTED') actions.push('start-review');
      if (status === 'UNDER_REVIEW') actions.push('assign', 'request-info', 'reject');
      if (status === 'ADDITIONAL_INFO_REQUIRED') actions.push('resume-review');
      if (status === 'AWAITING_DECISION') actions.push('approve', 'reject', 'request-info');
      if (status === 'REJECTED') actions.push('close');
    }
    if (assessor) {
      if (status === 'ASSESSOR_ASSIGNED') actions.push('start-assessment');
      if (status === 'ASSESSMENT_IN_PROGRESS') actions.push('submit-assessment', 'request-info');
      if (status === 'ADDITIONAL_INFO_REQUIRED') actions.push('resume-review');
    }
    return actions;
  }

  private async activeAssignment(claimId: string) {
    const [row] = await this.db
      .select({
        assessorId: claimAssignments.assessorId,
        assessorName: staffUsers.name,
        assignedAt: claimAssignments.createdAt,
      })
      .from(claimAssignments)
      .innerJoin(staffUsers, eq(staffUsers.id, claimAssignments.assessorId))
      .where(and(eq(claimAssignments.claimId, claimId), eq(claimAssignments.active, true)))
      .limit(1);
    return row ?? null;
  }
}

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

export const parseStatuses = (value?: string): ClaimStatus[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ClaimStatus => (CLAIM_STATUSES as readonly string[]).includes(s));
