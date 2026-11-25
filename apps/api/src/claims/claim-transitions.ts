import type { ClaimStatus } from '../db/schema';

export type ActorType = 'CUSTOMER' | 'AGENT' | 'STAFF' | 'SYSTEM';

export interface Actor {
  type: ActorType;
  id?: string;
}

const TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  DRAFT: ['SUBMITTED', 'CLOSED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ASSESSOR_ASSIGNED', 'ADDITIONAL_INFO_REQUIRED', 'REJECTED'],
  ASSESSOR_ASSIGNED: ['ASSESSMENT_IN_PROGRESS'],
  ASSESSMENT_IN_PROGRESS: ['ASSESSMENT_COMPLETED', 'ADDITIONAL_INFO_REQUIRED'],
  ASSESSMENT_COMPLETED: ['AWAITING_DECISION'],
  AWAITING_DECISION: ['APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUIRED'],
  ADDITIONAL_INFO_REQUIRED: ['UNDER_REVIEW'],
  APPROVED: ['PAYMENT_PENDING'],
  REJECTED: ['CLOSED'],
  PAYMENT_PENDING: ['CLOSED'],
  CLOSED: [],
};

const CUSTOMER_SIDE: Partial<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CLOSED'],
  ADDITIONAL_INFO_REQUIRED: ['UNDER_REVIEW'],
};

export class InvalidTransitionError extends Error {
  constructor(from: ClaimStatus, to: ClaimStatus, actor: Actor) {
    super(`${actor.type} cannot move a claim from ${from} to ${to}`);
  }
}

export function canTransition(from: ClaimStatus, to: ClaimStatus, actor: Actor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (actor.type === 'STAFF') return true;
  return CUSTOMER_SIDE[from]?.includes(to) ?? false;
}
