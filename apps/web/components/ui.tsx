import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout } from '@/app/login/actions';
import { STATUS_LABEL, STATUS_TONE, type Tone } from '@/lib/format';
import type { ClaimStatus, StaffUser } from '@/lib/types';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-ink/8 text-ink',
  attention: 'bg-amber-soft text-[#7a5a05]',
  go: 'bg-go-soft text-go',
  stop: 'bg-signal-soft text-signal',
  muted: 'bg-line/60 text-slate',
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${TONE_CLASS[STATUS_TONE[status]]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Plate({ registration, size = 'sm' }: { registration: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border-2 border-ink bg-white font-bold tracking-[0.08em] whitespace-nowrap text-ink ${
        size === 'lg' ? 'px-3 py-1 text-xl' : 'px-1.5 py-px text-sm'
      }`}
    >
      {registration}
    </span>
  );
}

export function AppHeader({ user }: { user: StaffUser }) {
  const role = user.role === 'ASSESSOR' ? 'Assessor' : user.role === 'ADMIN' ? 'Admin' : 'Claims processor';
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/claims" className="font-semibold">
          Car Buddy claims desk
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate">
            <span className="font-medium text-ink">{user.name}</span>
            <span className="hidden sm:inline">, {role}</span>
          </span>
          <form action={logout}>
            <button type="submit" className="rounded-md px-2 py-1 text-slate hover:bg-paper hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

const TRACK: { label: string; statuses: ClaimStatus[] }[] = [
  { label: 'Submitted', statuses: ['SUBMITTED'] },
  { label: 'In review', statuses: ['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED'] },
  { label: 'Assessor assigned', statuses: ['ASSESSOR_ASSIGNED'] },
  { label: 'Assessment', statuses: ['ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_COMPLETED'] },
  { label: 'Decision', statuses: ['AWAITING_DECISION'] },
  { label: 'Decided', statuses: ['APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'CLOSED'] },
];

export function StatusTrack({ status, stage = status }: { status: ClaimStatus; stage?: ClaimStatus }) {
  const current = TRACK.findIndex((s) => s.statuses.includes(stage));
  const final = status === 'REJECTED' ? 'Rejected' : status === 'APPROVED' || status === 'PAYMENT_PENDING' ? 'Approved' : null;
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Claim progress">
      {TRACK.map((step, i) => {
        const done = i < current;
        const here = i === current;
        const label = i === TRACK.length - 1 && final ? final : step.label;
        const bar = here
          ? status === 'REJECTED'
            ? 'bg-signal'
            : final
              ? 'bg-go'
              : 'bg-amber'
          : done
            ? 'bg-ink'
            : 'bg-line';
        return (
          <li key={step.label} aria-current={here ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${bar}`} />
            <p className={`mt-2 text-sm ${here ? 'font-semibold text-ink' : `hidden sm:block ${done ? 'text-ink' : 'text-slate'}`}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
