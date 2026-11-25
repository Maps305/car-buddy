'use client';

import { useActionState, type ReactNode } from 'react';
import type { Assessor, StaffAction } from '@/lib/types';
import { runAction, type ActionState } from './actions';

const input =
  'mt-1.5 block w-full rounded-md border border-line bg-white px-3 py-2 text-base outline-none focus:border-ink';
const primary = 'rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-ink-soft disabled:opacity-60';
const secondary = 'rounded-md border border-line bg-white px-4 py-2 font-medium hover:border-ink disabled:opacity-60';
const danger = 'rounded-md border border-signal bg-white px-4 py-2 font-medium text-signal hover:bg-signal-soft disabled:opacity-60';

function ActionForm({
  claimId,
  action,
  children,
  submit,
  pendingLabel,
  variant = 'primary',
}: {
  claimId: string;
  action: StaffAction;
  children?: ReactNode;
  submit: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(runAction.bind(null, claimId, action), {});
  const style = variant === 'danger' ? danger : variant === 'secondary' ? secondary : primary;
  return (
    <form action={formAction} className="space-y-3">
      {children}
      {state.error && (
        <p role="alert" className="rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={style}>
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="text-sm font-medium">
      {children}
      {hint && <span className="font-normal text-slate"> ({hint})</span>}
    </span>
  );
}

export function ActionPanel({
  claimId,
  actions,
  assessors,
}: {
  claimId: string;
  actions: StaffAction[];
  assessors: Assessor[];
}) {
  if (actions.length === 0) {
    return <p className="text-sm text-slate">Nothing for you to do on this claim right now.</p>;
  }
  const has = (a: StaffAction) => actions.includes(a);

  return (
    <div className="space-y-6">
      {has('start-review') && (
        <ActionForm claimId={claimId} action="start-review" submit="Start review" pendingLabel="Starting…">
          <p className="text-sm text-slate">Check the police report and the details read from it, then assign an assessor.</p>
        </ActionForm>
      )}

      {has('assign') && (
        <ActionForm claimId={claimId} action="assign" submit="Assign assessor" pendingLabel="Assigning…">
          <label className="block">
            <Label>Assessor</Label>
            <select name="assessorId" required className={input} defaultValue="">
              <option value="" disabled>
                Choose an assessor
              </option>
              {assessors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      )}

      {has('start-assessment') && (
        <ActionForm claimId={claimId} action="start-assessment" submit="Start assessment" pendingLabel="Starting…">
          <p className="text-sm text-slate">This claim is assigned to you. Start when you begin inspecting.</p>
        </ActionForm>
      )}

      {has('submit-assessment') && (
        <ActionForm claimId={claimId} action="submit-assessment" submit="Submit assessment" pendingLabel="Submitting…">
          <label className="block">
            <Label hint="at least 10 characters">Findings</Label>
            <textarea name="findings" required minLength={10} rows={4} className={input} />
          </label>
          <label className="block">
            <Label hint="optional">Damage observed</Label>
            <textarea name="damageDescription" rows={3} className={input} />
          </label>
          <label className="block">
            <Label hint="USD, optional">Estimated repair cost</Label>
            <input name="estimatedCost" type="number" min="0" step="0.01" inputMode="decimal" className={input} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Recommendation</legend>
            <div className="mt-2 space-y-1.5">
              {[
                ['APPROVE', 'Approve'],
                ['REJECT', 'Reject'],
                ['MORE_INFO', 'Need more information'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="recommendation" value={value} required className="accent-ink" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      )}

      {has('approve') && (
        <ActionForm claimId={claimId} action="approve" submit="Approve claim" pendingLabel="Approving…">
          <fieldset>
            <legend className="text-sm font-medium">Settlement</legend>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2">
                <input type="radio" name="settlement" value="REPAIR" required defaultChecked className="accent-ink" />
                Repair at a garage (letter of authorisation)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="settlement" value="CASH" className="accent-ink" />
                Pay out
              </label>
            </div>
          </fieldset>
          <label className="block">
            <Label hint="needed for repairs">Garage name</Label>
            <input name="garage" className={input} />
          </label>
          <label className="block">
            <Label hint="optional">Note</Label>
            <textarea name="note" rows={2} className={input} />
          </label>
        </ActionForm>
      )}

      {has('request-info') && (
        <ActionForm
          claimId={claimId}
          action="request-info"
          submit="Ask customer for more information"
          pendingLabel="Saving…"
          variant="secondary"
        >
          <label className="block">
            <Label>What’s needed</Label>
            <textarea name="note" required minLength={3} rows={2} className={input} />
          </label>
        </ActionForm>
      )}

      {has('resume-review') && (
        <ActionForm claimId={claimId} action="resume-review" submit="Resume review" pendingLabel="Resuming…">
          <p className="text-sm text-slate">Use this once the customer has sent what was asked for.</p>
        </ActionForm>
      )}

      {has('reject') && (
        <ActionForm claimId={claimId} action="reject" submit="Reject claim" pendingLabel="Rejecting…" variant="danger">
          <label className="block">
            <Label>Reason</Label>
            <textarea name="note" required minLength={3} rows={2} className={input} />
          </label>
        </ActionForm>
      )}

      {has('close') && (
        <ActionForm claimId={claimId} action="close" submit="Close claim" pendingLabel="Closing…" variant="secondary" />
      )}
    </div>
  );
}
