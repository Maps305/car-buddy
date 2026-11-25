import { Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { PoliceReportResult } from '../extraction/extraction.service';
import type { StoredMedia } from '../media/media.store';

export type SessionState = 'IDLE' | 'AWAITING_POLICE_REPORT' | 'CONFIRMING_POLICE_REPORT';

export interface ClaimDraft {
  reference: string;
  vehicleRegistration: string;
  startedAt: string;
  policeReport?: { media: StoredMedia; result: PoliceReportResult; confirmedAt?: string };
}

export interface Session {
  phone: string;
  state: SessionState;
  claim?: ClaimDraft;
  history: ChatCompletionMessageParam[];
  updatedAt: number;
}

const MAX_HISTORY = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SEEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly seen = new Map<string, number>();

  get(phone: string): Session {
    const existing = this.sessions.get(phone);
    if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) return existing;
    const fresh: Session = { phone, state: 'IDLE', history: [], updatedAt: Date.now() };
    this.sessions.set(phone, fresh);
    return fresh;
  }

  touch(session: Session): void {
    session.updatedAt = Date.now();
    if (session.history.length > MAX_HISTORY) session.history.splice(0, session.history.length - MAX_HISTORY);
  }

  firstSighting(messageId: string): boolean {
    const now = Date.now();
    for (const [id, at] of this.seen) if (now - at > SEEN_TTL_MS) this.seen.delete(id);
    if (this.seen.has(messageId)) return false;
    this.seen.set(messageId, now);
    return true;
  }
}
