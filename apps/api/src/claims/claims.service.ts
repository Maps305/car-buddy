import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DB, type Database } from '../db/db.module';
import { claimDocuments, claimEvents, claims, type ClaimIntake, type ClaimStatus } from '../db/schema';
import { canTransition, INFO_RETURN_STATUSES, InvalidTransitionError, type Actor } from './claim-transitions';

export type Claim = typeof claims.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ClaimDocument = typeof claimDocuments.$inferSelect;
export type NewClaimDocument = Omit<typeof claimDocuments.$inferInsert, 'id' | 'claimId' | 'createdAt'>;

const UNIQUE_VIOLATION = '23505';
export const DRAFT_TTL_DAYS = 7;
const DRAFT_TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class ClaimsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createDraft(input: { customerId: string; policyId: string; vehicleId: string }, actor: Actor): Promise<Claim> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = `CLM-${randomBytes(3).toString('hex').toUpperCase()}`;
      try {
        return await this.db.transaction(async (tx) => {
          const [claim] = await tx.insert(claims).values({ ...input, reference }).returning();
          await tx.insert(claimEvents).values({
            claimId: claim.id,
            type: 'CREATED',
            toStatus: 'DRAFT',
            actorType: actor.type,
            actorId: actor.id,
          });
          return claim;
        });
      } catch (err) {
        if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      }
    }
    throw new Error('Could not allocate a unique claim reference');
  }

  async get(id: string): Promise<Claim> {
    const [claim] = await this.db.select().from(claims).where(eq(claims.id, id)).limit(1);
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    return claim;
  }

  async findOpenDraft(customerId: string): Promise<Claim | undefined> {
    const drafts = await this.db
      .select()
      .from(claims)
      .where(and(eq(claims.customerId, customerId), eq(claims.status, 'DRAFT')))
      .orderBy(desc(claims.createdAt));

    const cutoff = Date.now() - DRAFT_TTL_MS;
    let open: Claim | undefined;
    for (const draft of drafts) {
      if (!open && draft.createdAt.getTime() >= cutoff) {
        open = draft;
        continue;
      }
      const reason =
        draft.createdAt.getTime() < cutoff ? `Draft expired after ${DRAFT_TTL_DAYS} days` : 'Replaced by a newer draft';
      await this.transition(draft.id, 'CLOSED', { type: 'SYSTEM' }, { reason });
    }
    return open;
  }

  async findAwaitingInfo(customerId: string): Promise<Claim | undefined> {
    const [claim] = await this.db
      .select()
      .from(claims)
      .where(and(eq(claims.customerId, customerId), eq(claims.status, 'ADDITIONAL_INFO_REQUIRED')))
      .orderBy(desc(claims.updatedAt))
      .limit(1);
    return claim;
  }

  async addCustomerReply(claimId: string, text: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(claimEvents).values({
        claimId,
        type: 'CUSTOMER_REPLY',
        actorType: actor.type,
        actorId: actor.id,
        data: { text: text.slice(0, 4000) },
      });
      await tx.update(claims).set({ updatedAt: new Date() }).where(eq(claims.id, claimId));
    });
  }

  async resumeAfterInfo(claimId: string, actor: Actor, data?: Record<string, unknown>): Promise<Claim> {
    const request = await this.latestInfoRequest(claimId);
    const origin = request?.from && INFO_RETURN_STATUSES.includes(request.from) ? request.from : 'UNDER_REVIEW';
    return this.transition(claimId, origin, actor, data);
  }

  async repliesSinceInfoRequest(claimId: string): Promise<number> {
    const request = await this.latestInfoRequest(claimId);
    if (!request) return 0;
    const [row] = await this.db
      .select({ n: count() })
      .from(claimEvents)
      .where(
        and(
          eq(claimEvents.claimId, claimId),
          eq(claimEvents.actorType, 'CUSTOMER'),
          inArray(claimEvents.type, ['CUSTOMER_REPLY', 'DOCUMENT_ADDED']),
          gt(claimEvents.createdAt, request.at),
        ),
      );
    return row?.n ?? 0;
  }

  private async latestInfoRequest(claimId: string) {
    const [request] = await this.db
      .select({ at: claimEvents.createdAt, from: claimEvents.fromStatus })
      .from(claimEvents)
      .where(and(eq(claimEvents.claimId, claimId), eq(claimEvents.toStatus, 'ADDITIONAL_INFO_REQUIRED')))
      .orderBy(desc(claimEvents.createdAt))
      .limit(1);
    return request;
  }

  async addDocument(claimId: string, doc: NewClaimDocument, actor: Actor): Promise<ClaimDocument> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(claimDocuments).values({ ...doc, claimId }).returning();
      await tx.insert(claimEvents).values({
        claimId,
        type: 'DOCUMENT_ADDED',
        actorType: actor.type,
        actorId: actor.id,
        data: { documentId: row.id, documentType: row.type, needsHumanReview: row.needsHumanReview },
      });
      await tx.update(claims).set({ updatedAt: new Date() }).where(eq(claims.id, claimId));
      return row;
    });
  }

  async latestDocument(claimId: string, type: ClaimDocument['type']): Promise<ClaimDocument | undefined> {
    const [row] = await this.db
      .select()
      .from(claimDocuments)
      .where(and(eq(claimDocuments.claimId, claimId), eq(claimDocuments.type, type)))
      .orderBy(desc(claimDocuments.createdAt))
      .limit(1);
    return row;
  }

  async confirmDocument(documentId: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(claimDocuments)
        .set({ customerConfirmedAt: new Date() })
        .where(eq(claimDocuments.id, documentId))
        .returning();
      if (!row) throw new NotFoundException(`Document ${documentId} not found`);
      await tx.insert(claimEvents).values({
        claimId: row.claimId,
        type: 'DOCUMENT_CONFIRMED',
        actorType: actor.type,
        actorId: actor.id,
        data: { documentId },
      });
    });
  }

  async updateDraftDetails(
    claimId: string,
    details: Partial<Pick<Claim, 'accidentDate' | 'accidentTime' | 'accidentPlace' | 'description'>>,
  ): Promise<void> {
    await this.db
      .update(claims)
      .set({ ...details, updatedAt: new Date() })
      .where(and(eq(claims.id, claimId), eq(claims.status, 'DRAFT')));
  }

  async updateIntake(claimId: string, patch: ClaimIntake): Promise<ClaimIntake> {
    const [row] = await this.db
      .update(claims)
      .set({ intake: sql`${claims.intake} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
      .where(and(eq(claims.id, claimId), eq(claims.status, 'DRAFT')))
      .returning({ intake: claims.intake });
    if (!row) throw new NotFoundException(`Draft claim ${claimId} not found`);
    return row.intake;
  }

  async documentCounts(claimId: string): Promise<Partial<Record<ClaimDocument['type'], number>>> {
    const rows = await this.db
      .select({ type: claimDocuments.type, n: count() })
      .from(claimDocuments)
      .where(eq(claimDocuments.claimId, claimId))
      .groupBy(claimDocuments.type);
    return Object.fromEntries(rows.map((r) => [r.type, r.n]));
  }

  async recordEvent(claimId: string, type: string, actor: Actor, data?: Record<string, unknown>): Promise<void> {
    await this.db.insert(claimEvents).values({ claimId, type, actorType: actor.type, actorId: actor.id, data });
  }

  async transition(
    claimId: string,
    to: ClaimStatus,
    actor: Actor,
    data?: Record<string, unknown>,
    tx?: Tx,
  ): Promise<Claim> {
    const run = async (t: Tx) => {
      const [current] = await t.select().from(claims).where(eq(claims.id, claimId)).for('update');
      if (!current) throw new NotFoundException(`Claim ${claimId} not found`);
      if (!canTransition(current.status, to, actor)) throw new InvalidTransitionError(current.status, to, actor);

      const now = new Date();
      const [updated] = await t
        .update(claims)
        .set({ status: to, updatedAt: now, ...(to === 'SUBMITTED' ? { submittedAt: now } : {}) })
        .where(eq(claims.id, claimId))
        .returning();
      await t.insert(claimEvents).values({
        claimId,
        type: 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id,
        data,
      });
      return updated;
    };
    return tx ? run(tx) : this.db.transaction(run);
  }
}
