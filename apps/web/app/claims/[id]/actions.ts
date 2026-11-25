'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, api } from '@/lib/api';
import type { StaffAction } from '@/lib/types';

export interface ActionState {
  error?: string;
  done?: string;
}

const DONE: Record<StaffAction, string> = {
  'start-review': 'Review started.',
  assign: 'Assessor assigned.',
  'start-assessment': 'Assessment started.',
  'submit-assessment': 'Assessment submitted to the processor.',
  'request-info': 'Marked as waiting on the customer.',
  'resume-review': 'Back in review.',
  approve: 'Claim approved.',
  reject: 'Claim rejected.',
  close: 'Claim closed.',
};

function bodyFor(action: StaffAction, form: FormData): Record<string, unknown> {
  const text = (name: string) => {
    const v = String(form.get(name) ?? '').trim();
    return v === '' ? undefined : v;
  };
  switch (action) {
    case 'assign':
      return { assessorId: text('assessorId') };
    case 'submit-assessment':
      return {
        findings: text('findings'),
        damageDescription: text('damageDescription'),
        estimatedCost: text('estimatedCost'),
        recommendation: text('recommendation'),
      };
    case 'request-info':
    case 'reject':
      return { note: text('note') };
    case 'approve':
      return { settlement: text('settlement'), garage: text('garage'), note: text('note') };
    default:
      return {};
  }
}

export async function runAction(
  claimId: string,
  action: StaffAction,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await api(`/staff/claims/${claimId}/actions/${action}`, {
      method: 'POST',
      body: JSON.stringify(bodyFor(action, form)),
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Can't reach the claims API. Try again." };
  }
  revalidatePath(`/claims/${claimId}`);
  revalidatePath('/claims');
  return { done: DONE[action] };
}
