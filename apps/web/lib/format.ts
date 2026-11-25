import type { ClaimStatus } from './types';

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'New',
  UNDER_REVIEW: 'In review',
  ASSESSOR_ASSIGNED: 'Assessor assigned',
  ASSESSMENT_IN_PROGRESS: 'Being assessed',
  ASSESSMENT_COMPLETED: 'Assessed',
  AWAITING_DECISION: 'Awaiting decision',
  ADDITIONAL_INFO_REQUIRED: 'Waiting on customer',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAYMENT_PENDING: 'Settlement pending',
  CLOSED: 'Closed',
};

export type Tone = 'neutral' | 'attention' | 'go' | 'stop' | 'muted';

export const STATUS_TONE: Record<ClaimStatus, Tone> = {
  DRAFT: 'muted',
  SUBMITTED: 'attention',
  UNDER_REVIEW: 'neutral',
  ASSESSOR_ASSIGNED: 'neutral',
  ASSESSMENT_IN_PROGRESS: 'neutral',
  ASSESSMENT_COMPLETED: 'neutral',
  AWAITING_DECISION: 'attention',
  ADDITIONAL_INFO_REQUIRED: 'muted',
  APPROVED: 'go',
  REJECTED: 'stop',
  PAYMENT_PENDING: 'go',
  CLOSED: 'muted',
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Harare',
});

export const formatDate = (value: string | null) => (value ? dateFmt.format(new Date(value)) : '—');
export const formatDateTime = (value: string | null) => (value ? dateTimeFmt.format(new Date(value)) : '—');

export const formatMoney = (amount: string | null, currency: string) =>
  amount === null
    ? 'Not given'
    : new Intl.NumberFormat('en-ZW', { style: 'currency', currency, currencyDisplay: 'code' }).format(Number(amount));

export const humanise = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
