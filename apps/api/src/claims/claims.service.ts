import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DB, type Database } from '../db/db.module';
import { claimDocuments, claimEvents, claims, type ClaimStatus } from '../db/schema';
import { canTransition, InvalidTransitionError, type Actor } from './claim-transitions';

export type Claim = typeof claims.$inferSelect;
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

  async transition(claimId: string, to: ClaimStatus, actor: Actor, data?: Record<string, unknown>): Promise<Claim> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(claims).where(eq(claims.id, claimId)).for('update');
      if (!current) throw new NotFoundException(`Claim ${claimId} not found`);
      if (!canTransition(current.status, to, actor)) throw new InvalidTransitionError(current.status, to, actor);

      const now = new Date();
      const [updated] = await tx
        .update(claims)
        .set({ status: to, updatedAt: now, ...(to === 'SUBMITTED' ? { submittedAt: now } : {}) })
        .where(eq(claims.id, claimId))
        .returning();
      await tx.insert(claimEvents).values({
        claimId,
        type: 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id,
        data,
      });
      return updated;
    });
  }
}
