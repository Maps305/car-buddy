import Link from 'next/link';
import { AppHeader, Plate, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { requireUser } from '@/lib/session';
import type { ClaimStatus, QueueItem } from '@/lib/types';

interface Tab {
  key: string;
  label: string;
  statuses: ClaimStatus[];
}

const PROCESSOR_TABS: Tab[] = [
  { key: 'new', label: 'New', statuses: ['SUBMITTED'] },
  { key: 'review', label: 'In review', statuses: ['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED'] },
  { key: 'assessor', label: 'With assessor', statuses: ['ASSESSOR_ASSIGNED', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_COMPLETED'] },
  { key: 'decision', label: 'Awaiting decision', statuses: ['AWAITING_DECISION'] },
  { key: 'decided', label: 'Decided', statuses: ['APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'CLOSED'] },
  { key: 'all', label: 'All', statuses: [] },
];

const ASSESSOR_TABS: Tab[] = [
  { key: 'todo', label: 'To start', statuses: ['ASSESSOR_ASSIGNED'] },
  { key: 'active', label: 'In progress', statuses: ['ASSESSMENT_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED'] },
  {
    key: 'done',
    label: 'Submitted',
    statuses: ['ASSESSMENT_COMPLETED', 'AWAITING_DECISION', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'CLOSED'],
  },
];

const EMPTY: Record<string, string> = {
  new: 'No new claims. Claims appear here once a customer confirms their police report on WhatsApp.',
  review: 'Nothing in review. Start a review from the New tab.',
  assessor: 'No claims are with assessors right now.',
  decision: 'No assessments are waiting for a decision.',
  decided: 'No decided claims yet.',
  all: 'No claims yet.',
  todo: 'No claims are waiting for you to start.',
  active: 'You have no assessments in progress.',
  done: 'You haven’t submitted any assessments yet.',
};

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tabs = user.role === 'ASSESSOR' ? ASSESSOR_TABS : PROCESSOR_TABS;
  const { tab: tabKey } = await searchParams;
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  const query = tab.statuses.length ? `?status=${tab.statuses.join(',')}` : '';
  const claims = await api<QueueItem[]>(`/staff/claims${query}`);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{user.role === 'ASSESSOR' ? 'My assessments' : 'Claims'}</h1>

        <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Claim status">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/claims?tab=${t.key}`}
              aria-current={t.key === tab.key ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                t.key === tab.key ? 'border-ink text-ink' : 'border-transparent text-slate hover:text-ink'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {claims.length === 0 ? (
          <p className="py-16 text-center text-slate">{EMPTY[tab.key]}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-slate">
                <tr>
                  <th className="px-4 py-3 font-medium">Claim</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Accident</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assessor</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/claims/${c.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {c.reference}
                      </Link>
                      {c.needsHumanReview && (
                        <span className="mt-1 block text-xs font-medium text-[#7a5a05]">Police report needs checking</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{c.customerName}</td>
                    <td className="px-4 py-3">
                      <Plate registration={c.registration} />
                      <span className="mt-1 block text-slate">{c.vehicle}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatDate(c.accidentDate)}
                      {c.accidentPlace && <span className="mt-1 block max-w-56 truncate text-slate">{c.accidentPlace}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-slate">{c.assessorName ?? 'Not assigned'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate">{formatDateTime(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
