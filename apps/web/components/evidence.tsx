import { Plate } from '@/components/ui';
import { formatDate, humanise } from '@/lib/format';
import type { ClaimDocument, Field, Party, PoliceReportReview, ReviewFlag } from '@/lib/types';

type FieldStatus = PoliceReportReview['fields'][number]['status'];

const REVIEW_THRESHOLD = 0.75;

function display(value: string | boolean | null): string {
  if (value === null || value === '') return 'Not on report';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  return value;
}

function Confidence({ field, status }: { field: Field; status?: FieldStatus }) {
  if (field.value === null || field.value === '') return null;
  const pct = Math.round(field.confidence * 100);
  const low = status === 'LOW_CONFIDENCE' || field.confidence < REVIEW_THRESHOLD;
  if (!low) return null;
  return (
    <span className="mt-1 flex items-center gap-2">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="block h-full bg-amber" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs font-medium text-[#7a5a05]">Check against photo: {pct}% sure</span>
    </span>
  );
}

function FieldRow({ label, field, status }: { label: string; field: Field; status?: FieldStatus }) {
  const missing = status === 'MISSING' || status === 'INVALID';
  return (
    <div className={`grid grid-cols-[9rem_1fr] gap-3 px-3 py-2.5 ${missing ? 'bg-signal-soft/60' : status === 'LOW_CONFIDENCE' ? 'bg-amber-soft/60' : ''}`}>
      <dt className="text-sm text-slate">{label}</dt>
      <dd>
        <span className={missing ? 'text-signal' : ''} title={field.sourceText ? `Read as: ${field.sourceText}` : undefined}>
          {display(field.value)}
        </span>
        <Confidence field={field} status={status} />
      </dd>
    </div>
  );
}

const FLAG_STYLE: Record<ReviewFlag['severity'], string> = {
  BLOCKER: 'border-signal bg-signal-soft text-signal',
  WARN: 'border-amber bg-amber-soft text-[#6b4f04]',
  INFO: 'border-line bg-paper text-slate',
};
const FLAG_LABEL: Record<ReviewFlag['severity'], string> = { BLOCKER: 'Blocks claim', WARN: 'Check', INFO: 'Note' };
const SEVERITY_ORDER: ReviewFlag['severity'][] = ['BLOCKER', 'WARN', 'INFO'];

const LIABILITY: Record<PoliceReportReview['liability']['status'], string> = {
  CHARGED: 'A driver was charged or fined',
  NO_CHARGE: 'Police recorded no criminal action',
  UNDER_INVESTIGATION: 'Under investigation, papers going to the prosecutor',
  UNKNOWN: 'Outcome not filled in on the report',
};

function PartiesTable({ parties, insured }: { parties: Party[]; insured: Party['position'] | null }) {
  if (parties.length === 0) return <p className="text-sm text-signal">No parties were read from the report.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">Party</th>
            <th className="py-2 pr-3 font-medium">Driver</th>
            <th className="py-2 pr-3 font-medium">Vehicle</th>
            <th className="py-2 pr-3 font-medium">Insurer, policy</th>
            <th className="py-2 pr-3 font-medium">Injuries</th>
            <th className="py-2 font-medium">Damage</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={p.position} className="border-b border-line align-top last:border-0">
              <td className="py-2.5 pr-3">
                {humanise(p.position)}
                {insured === p.position && <span className="mt-1 block text-xs font-semibold text-go">Our insured</span>}
              </td>
              <td className="py-2.5 pr-3">{display(p.driverName.value)}</td>
              <td className="py-2.5 pr-3">
                {p.registrationNumber.value ? <Plate registration={p.registrationNumber.value} /> : 'No registration'}
                <span className="mt-1 block text-slate">{display(p.vehicleMakeAndType.value)}</span>
              </td>
              <td className="py-2.5 pr-3">
                {display(p.insurer.value)}
                {p.policyNumber.value && <span className="mt-1 block text-slate">{p.policyNumber.value}</span>}
              </td>
              <td className="py-2.5 pr-3">{display(p.injuries.value)}</td>
              <td className="py-2.5">{display(p.vehicleDamage.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PoliceReportEvidence({ claimId, doc }: { claimId: string; doc: ClaimDocument }) {
  const x = doc.extraction;
  const review = doc.review;
  const src = `/api/documents/${claimId}/${doc.id}`;
  const statusOf = new Map(review?.fields.map((f) => [f.field, f.status]) ?? []);
  const flags = [...(review?.flags ?? [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <figure>
        {doc.mimeType.startsWith('image/') ? (
          <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Police report photo sent by the customer" className="max-h-[42rem] w-full object-contain" />
          </a>
        ) : (
          <iframe src={src} title="Police report PDF" className="h-[42rem] w-full rounded-md border border-line" />
        )}
        <figcaption className="mt-2 text-sm text-slate">
          Sent on WhatsApp{doc.customerConfirmedAt ? ', confirmed by the customer' : ', not yet confirmed by the customer'}.{' '}
          <a href={src} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
            Open full size
          </a>
        </figcaption>
      </figure>

      <div className="space-y-6">
        {flags.length > 0 && (
          <ul className="space-y-2">
            {flags.map((f, i) => (
              <li key={i} className={`rounded-md border-l-4 px-3 py-2 text-sm ${FLAG_STYLE[f.severity]}`}>
                <span className="font-semibold">{FLAG_LABEL[f.severity]}: </span>
                {f.message}
              </li>
            ))}
          </ul>
        )}

        {x && (
          <>
            <dl className="divide-y divide-line rounded-md border border-line">
              <FieldRow label="TAB number" field={x.tabNumber} status={statusOf.get('tabNumber')} />
              <FieldRow label="Station" field={x.stationReported} status={statusOf.get('stationReported')} />
              <FieldRow label="Accident date" field={x.accidentDate} status={statusOf.get('accidentDate')} />
              <FieldRow label="Time" field={x.accidentTime} status={statusOf.get('accidentTime')} />
              <FieldRow label="Place" field={x.placeOfOccurrence} status={statusOf.get('placeOfOccurrence')} />
              <FieldRow label="Report date" field={x.reportDate} status={statusOf.get('reportDate')} />
              <FieldRow label="Officer" field={x.officerName} status={statusOf.get('officerName')} />
              <FieldRow label="Police stamp" field={x.hasPoliceStamp} status={statusOf.get('hasPoliceStamp')} />
            </dl>

            {review && (
              <div className="rounded-md bg-paper px-4 py-3">
                <p className="text-sm text-slate">Police outcome</p>
                <p className="mt-1 font-medium">{LIABILITY[review.liability.status]}</p>
                {review.liability.chargedPerson && (
                  <p className="mt-1 text-sm">
                    Charged or fined: {review.liability.chargedPerson}
                    {review.liability.insuredDriverCharged ? ' (appears to be our insured’s driver)' : ''}
                  </p>
                )}
                {review.liability.responsiblePartyIfNoCharge && (
                  <p className="mt-1 text-sm">Responsible, per police: {review.liability.responsiblePartyIfNoCharge}</p>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {x && (
        <div className="space-y-4 xl:col-span-2">
          <PartiesTable parties={x.parties} insured={review?.insuredParty ?? null} />
          {x.notes.length > 0 && (
            <div>
              <p className="text-sm text-slate">Remarks from the AI reading</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {x.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate xl:col-span-2">
        Read by {doc.extractionModel ?? 'AI'}. Amber fields were read with low confidence and red ones are missing or
        invalid. Hover a value to see the text exactly as read.
      </p>
    </div>
  );
}
