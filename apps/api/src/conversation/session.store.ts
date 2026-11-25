import { Inject, Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { DB, type Database } from '../db/db.module';
import { conversationSessions, processedMessages, sessionState } from '../db/schema';

export type SessionState = (typeof sessionState.enumValues)[number];

export interface Session {
  phone: string;
  customerId: string | null;
  state: SessionState;
  activeClaimId: string | null;
  history: ChatCompletionMessageParam[];
}

const MAX_HISTORY = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY = 200;

@Injectable()
export class SessionStore {
  private sightings = 0;

  constructor(@Inject(DB) private readonly db: Database) {}

  async get(phone: string): Promise<Session> {
    const [row] = await this.db
      .insert(conversationSessions)
      .values({ phone })
      .onConflictDoUpdate({ target: conversationSessions.phone, set: { phone } })
      .returning();

    const expired = Date.now() - row.updatedAt.getTime() > SESSION_TTL_MS;
    return {
      phone,
      customerId: row.customerId,
      state: expired ? 'IDLE' : row.state,
      activeClaimId: expired ? null : row.activeClaimId,
      history: expired ? [] : (row.history as ChatCompletionMessageParam[]),
    };
  }

  async save(session: Session): Promise<void> {
    await this.db
      .update(conversationSessions)
      .set({
        customerId: session.customerId,
        state: session.state,
        activeClaimId: session.activeClaimId,
        history: session.history.slice(-MAX_HISTORY),
        updatedAt: new Date(),
      })
      .where(eq(conversationSessions.phone, session.phone));
  }

  async firstSighting(messageId: string): Promise<boolean> {
    if (++this.sightings % PRUNE_EVERY === 0) {
      await this.db
        .delete(processedMessages)
        .where(lt(processedMessages.receivedAt, new Date(Date.now() - PROCESSED_RETENTION_MS)));
    }
    const inserted = await this.db
      .insert(processedMessages)
      .values({ messageId })
      .onConflictDoNothing()
      .returning({ messageId: processedMessages.messageId });
    return inserted.length > 0;
  }
}
