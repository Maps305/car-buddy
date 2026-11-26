import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PoliceReportEvidence } from '@/components/evidence';
import { InfoRequests, buildThread } from '@/components/info-requests';
import { AppHeader, Panel, Plate, StatusBadge, StatusTrack } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { STATUS_LABEL, formatDate, formatDateTime, formatMoney, humanise } from '@/lib/format';
import { requireUser } from '@/lib/session';
import type { Assessor, ClaimDetail, ClaimEvent } from '@/lib/types';
import { ActionPanel } from './action-panel';

const RECOMMENDATION = { APPROVE: 'Approve', REJECT: 'Reject', MORE_INFO: 'Need more information' } as const;

function eventText(e: ClaimEvent): string {
  const d = e.data ?? {};
  switch (e.type) {
    case 'CREATED':
      return 'Claim opened on WhatsApp';
    case 'DOCUMENT_ADDED':
      if (d.documentType === 'OTHER' && e.actorType === 'CUSTOMER') return 'Customer sent a file';
      return `Document received${d.needsHumanReview ? ', flagged for checking' : ''}`;
    case 'CUSTOMER_REPLY': {
      const text = typeof d.text === 'string' ? d.text : '';
      return `Customer replied: “${text.length > 140 ? `${text.slice(0, 140)}…` : text}”`;
    }
    case 'CUSTOMER_NOTIFIED':
      return 'WhatsApp message sent to the customer';
    case 'CUSTOMER_NOTIFY_FAILED':
      return `WhatsApp message not delivered: ${typeof d.reason === 'string' ? d.reason : 'unknown error'}`;
    case 'DOCUMENT_CONFIRMED':
      return 'Customer confirmed the police report details';
    case 'STATUS_CHANGED': {
      const base = e.toStatus ? STATUS_LABEL[e.toStatus] : 'Status changed';
      if (e.toStatus === 'SUBMITTED') return 'Submitted by the customer';
      if (e.toStatus === 'ASSESSOR_ASSIGNED' && d.assessorName) return `Assigned to ${d.assessorName}`;
      if (e.toStatus === 'ASSESSMENT_IN_PROGRESS') return 'Assessment started';
      if (e.toStatus === 'ASSESSMENT_COMPLETED' && typeof d.recommendation === 'string')
        return `Assessment submitted, recommends ${RECOMMENDATION[d.recommendation as keyof typeof RECOMMENDATION].toLowerCase()}`;
      if (e.toStatus === 'AWAITING_DECISION') return 'Sent to the processor for a decision';
      if (e.fromStatus === 'ADDITIONAL_INFO_REQUIRED' && e.toStatus)
        return e.actorType === 'CUSTOMER'
          ? `Customer sent the requested information, back to ${STATUS_LABEL[e.toStatus].toLowerCase()}`
          : `Resumed, back to ${STATUS_LABEL[e.toStatus].toLowerCase()}`;
      if (e.toStatus === 'UNDER_REVIEW') return 'Review started';
      if (e.toStatus === 'ADDITIONAL_INFO_REQUIRED') return 'Asked the customer for more information';
      if (e.toStatus === 'APPROVED')
        return `Approved: ${d.settlement === 'REPAIR' ? `repair at ${d.garage}` : 'pay out'}`;
      if (typeof d.note === 'string') return `${base}: ${d.note}`;
      if (typeof d.reason === 'string') return `${base}: ${d.reason}`;
      return base;
    }
    default:
      return humanise(e.type);
  }
}

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  let detail: ClaimDetail;
  try {
    detail = await api<ClaimDetail>(`/staff/claims/${id}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    if (err instanceof ApiError && err.status === 403) {
      return (
        <>
          <AppHeader user={user} />
          <main className="mx-auto max-w-3xl px-6 py-16">
            <h1 className="text-xl font-semibold">This claim isn’t assigned to you</h1>
            <p className="mt-2 text-slate">Assessors only see claims assigned to them. Ask the claims processor if you need access.</p>
            <Link href="/claims" className="mt-6 inline-block underline underline-offset-4">
              Back to my assessments
            </Link>
          </main>
        </>
      );
    }
    throw err;
  }

  const { claim, customer, policy, vehicle, documents, events, assignment, assessment, allowedActions } = detail;
  const assessors = allowedActions.includes('assign') ? await api<Assessor[]>('/staff/assessors') : [];
  const policeReport = documents.find((d) => d.type === 'POLICE_REPORT');
  const thread = buildThread(events, documents);
  const askedFrom = events.findLast((e) => e.toStatus === 'ADDITIONAL_INFO_REQUIRED')?.fromStatus;
  const stage = claim.status === 'ADDITIONAL_INFO_REQUIRED' && askedFrom ? askedFrom : claim.status;
  const inThread = new Set(thread.flatMap((i) => (i.kind === 'file' ? [i.doc.id] : [])));
  const otherDocs = documents.filter((d) => d !== policeReport && !inThread.has(d.id));

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/claims" className="text-sm text-slate underline-offset-4 hover:text-ink hover:underline">
          All claims
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{claim.reference}</h1>
          <Plate registration={vehicle.registration} size="lg" />
          <StatusBadge status={claim.status} />
        </div>
        <p className="mt-2 text-slate">
          {customer.firstName} {customer.surname}, {vehicle.year ? `${vehicle.year} ` : ''}
          {vehicle.make} {vehicle.model}
          {claim.submittedAt ? `, submitted ${formatDateTime(claim.submittedAt)}` : ''}
        </p>

        <div className="mt-6">
          <StatusTrack status={claim.status} stage={stage} />
        </div>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <Panel title="Police report">
              {policeReport ? (
                <PoliceReportEvidence claimId={claim.id} doc={policeReport} />
              ) : (
                <p className="text-slate">No police report has been received yet.</p>
              )}
            </Panel>

            {thread.length > 0 && (
              <Panel
                title="Information requests"
                aside={
                  claim.status === 'ADDITIONAL_INFO_REQUIRED' ? (
                    <span className="text-sm text-slate">Waiting for the customer</span>
                  ) : undefined
                }
              >
                <InfoRequests claimId={claim.id} items={thread} />
              </Panel>
            )}

            {assessment && (
              <Panel title="Assessment" aside={<span className="text-sm text-slate">{assessment.assessorName}, {formatDateTime(assessment.createdAt)}</span>}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-slate">Recommendation</dt>
                    <dd className="mt-1 font-semibold">{RECOMMENDATION[assessment.recommendation]}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate">Estimated repair cost</dt>
                    <dd className="mt-1 font-semibold">{formatMoney(assessment.estimatedCost, assessment.currency)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-slate">Findings</dt>
                    <dd className="mt-1 whitespace-pre-line">{assessment.findings}</dd>
                  </div>
                  {assessment.damageDescription && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm text-slate">Damage observed</dt>
                      <dd className="mt-1 whitespace-pre-line">{assessment.damageDescription}</dd>
                    </div>
                  )}
                </dl>
              </Panel>
            )}

            {otherDocs.length > 0 && (
              <Panel title="Other documents">
                <ul className="space-y-2 text-sm">
                  {otherDocs.map((d) => (
                    <li key={d.id}>
                      <a href={`/api/documents/${claim.id}/${d.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        {humanise(d.type)}
                      </a>{' '}
                      <span className="text-slate">received {formatDateTime(d.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          <aside className="space-y-6">
            <Panel title="Your next step">
              <ActionPanel claimId={claim.id} actions={allowedActions} assessors={assessors} />
            </Panel>

            <Panel title="Claim details">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate">Customer</dt>
                  <dd className="mt-0.5">
                    {customer.firstName} {customer.surname}
                    <span className="block text-slate">+{customer.phone}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate">Policy</dt>
                  <dd className="mt-0.5">
                    {policy.policyNumber}, {humanise(policy.coverType)} cover
                  </dd>
                </div>
                <div>
                  <dt className="text-slate">Accident</dt>
                  <dd className="mt-0.5">
                    {formatDate(claim.accidentDate)}
                    {claim.accidentTime ? ` at ${claim.accidentTime}` : ''}
                    {claim.accidentPlace && <span className="block text-slate">{claim.accidentPlace}</span>}
                  </dd>
                </div>
                {vehicle.odometerKm !== null && (
                  <div>
                    <dt className="text-slate">Odometer on file</dt>
                    <dd className="mt-0.5">{vehicle.odometerKm.toLocaleString('en-GB')} km</dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate">Assessor</dt>
                  <dd className="mt-0.5">{assignment?.assessorName ?? 'Not assigned yet'}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="History">
              <ol className="space-y-4">
                {[...events].reverse().map((e) => (
                  <li key={e.id} className="border-l-2 border-line pl-3">
                    <p className="text-sm">{eventText(e)}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {e.actorName}, {formatDateTime(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </Panel>
          </aside>
        </div>
      </main>
    </>
  );
}
