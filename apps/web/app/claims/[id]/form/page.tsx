import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PrintButton } from '@/components/print-button';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatDateTime, humanise } from '@/lib/format';
import { requireUser } from '@/lib/session';
import type { ClaimDetail, Field as ReportField, Party, QuotationExtraction } from '@/lib/types';

export const metadata: Metadata = { title: 'Motor accident claim form' };

const DECLARATION =
  'Insurance fraud is a crime. I declare that the information I have given is true and complete to the best of my knowledge.';

const v = (f?: ReportField<string> | null) => f?.value ?? null;

function Field({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={`break-inside-avoid border-b border-[#9aa6b8] pb-1 ${wide ? 'col-span-2 sm:col-span-4' : 'col-span-2'}`}>
      <dt className="text-[11px] text-slate">{label}</dt>
      <dd className={`mt-0.5 min-h-5 text-sm ${empty ? 'text-slate/60' : ''}`}>{empty ? 'Not collected' : value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="break-after-avoid bg-ink px-2 py-1 text-sm font-semibold text-white">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-2 pt-3 pb-5 sm:grid-cols-4">{children}</dl>
    </section>
  );
}

export default async function ClaimFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  let detail: ClaimDetail;
  try {
    detail = await api<ClaimDetail>(`/staff/claims/${id}`);
  } catch (err) {
    if (err instanceof ApiError && [400, 403, 404].includes(err.status)) notFound();
    throw err;
  }

  const { claim, customer, policy, vehicle, documents } = detail;
  const i = claim.intake;
  const report = documents.find((d) => d.type === 'POLICE_REPORT');
  const x = report?.extraction ?? null;
  const insuredPosition = report?.review?.insuredParty ?? null;
  const insured: Party | undefined = x?.parties.find((p) => p.position === insuredPosition);
  const others = x?.parties.filter((p) => p.position !== insuredPosition) ?? [];
  const sketch = documents.find((d) => d.type === 'SKETCH');
  const has = (type: string) => documents.some((d) => d.type === type);
  const insuredName = `${customer.firstName} ${customer.surname}`;
  const injuries = x?.parties.map((p) => v(p.injuries)).filter((s) => s && !/^(nil|none|no)$/i.test(s)) ?? [];
  const quotes = documents
    .filter((d) => d.type === 'QUOTATION')
    .map((d) => d.extraction as unknown as QuotationExtraction | null);
  const quotedTotals = quotes
    .map((q) =>
      q && typeof q.total.value === 'number'
        ? `${q.supplier.value ?? 'Unknown supplier'}: ${q.currency.value ?? ''} ${q.total.value.toFixed(2)}`.replace(/\s+/g, ' ')
        : null,
    )
    .filter(Boolean);
  const witnesses = x?.parties.map((p) => v(p.witness)).filter(Boolean) ?? [];

  return (
    <main className="mx-auto max-w-[210mm] bg-white px-6 py-8 text-ink print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/claims/${claim.id}`} className="text-sm text-slate underline-offset-4 hover:text-ink hover:underline">
          Back to {claim.reference}
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink-soft">Moovah Insurance</p>
          <h1 className="font-display text-2xl font-bold">Motor accident claim form</h1>
        </div>
        <dl className="text-right text-sm">
          <dt className="text-slate">Claim</dt>
          <dd className="font-semibold">{claim.reference}</dd>
          <dt className="mt-1 text-slate">Submitted</dt>
          <dd>{formatDateTime(claim.submittedAt)}</dd>
        </dl>
      </header>
      <p className="mt-2 mb-5 text-xs text-slate">
        Completed from the customer’s answers on WhatsApp and the police report they confirmed. Fields marked “Not collected” were not asked for.
      </p>

      <div className="space-y-1">
        <Section title="The insured">
          <Field label="Full name" value={insuredName} />
          <Field label="Policy number" value={policy.policyNumber} />
          <Field label="Phone" value={`+${customer.phone}`} />
          <Field label="Email" value={customer.email} />
          <Field label="Cover" value={humanise(policy.coverType)} />
          <Field label="Address" value={v(insured?.residentialAddress)} />
        </Section>

        <Section title="The vehicle">
          <Field label="Registration" value={vehicle.registration} />
          <Field label="Make and model" value={`${vehicle.make} ${vehicle.model}`} />
          <Field label="Year" value={vehicle.year} />
          <Field label="Odometer on file" value={vehicle.odometerKm !== null ? `${vehicle.odometerKm.toLocaleString('en-GB')} km` : null} />
        </Section>

        <Section title="The driver">
          <Field label="Name" value={i.driver === 'INSURED' ? `${insuredName} (the insured)` : i.driverName} />
          <Field label="Phone" value={i.driver === 'INSURED' ? `+${customer.phone}` : i.driverPhone} />
          <Field label="Driver’s licence" value={has('DRIVER_LICENCE') ? 'Copy attached, front and back' : null} />
          <Field label="Licence number" value={null} />
        </Section>

        <Section title="Circumstances of the accident">
          <Field label="Date" value={claim.accidentDate ? formatDate(claim.accidentDate) : null} />
          <Field label="Time" value={claim.accidentTime} />
          <Field label="Place" value={claim.accidentPlace} wide />
          <Field label="Speed" value={i.speedKmh !== undefined ? `${i.speedKmh} km/h` : null} />
          <Field label="Weather" value={i.weather} />
          <Field label="Description, in the insured’s words" value={i.description ?? claim.description} wide />
          <Field label="Damage to the insured vehicle" value={v(insured?.vehicleDamage)} wide />
          <Field label="Passengers" value={v(insured?.passengerNames)} wide />
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[11px] text-slate">Sketch</dt>
            <dd className="mt-1">
              {sketch ? (
                <img
                  src={`/api/documents/${claim.id}/${sketch.id}`}
                  alt="Sketch of the accident drawn by the customer"
                  className="max-h-72 rounded border border-line"
                />
              ) : (
                <span className="text-sm text-signal">{i.sketchSkipped ? 'Skipped by the customer' : 'Not collected'}</span>
              )}
            </dd>
          </div>
        </Section>

        <Section title="Police">
          <Field label="Station reported" value={v(x?.stationReported)} />
          <Field label="TAB number" value={v(x?.tabNumber)} />
          <Field label="Officer" value={[v(x?.officerRank), v(x?.officerName)].filter(Boolean).join(' ') || null} />
          <Field label="Date of report" value={v(x?.reportDate)} />
          <Field
            label="Charge or fine"
            value={
              x && v(x.depositFineFor)
                ? `${v(x.depositFinePaidBy) ?? 'Unknown'} fined${v(x.depositFineAmount) ? ` ${v(x.depositFineAmount)}` : ''} for ${v(x.depositFineFor)}`
                : null
            }
            wide
          />
        </Section>

        {(others.length ? others : [undefined]).map((p, n) => (
          <Section key={p?.position ?? n} title={others.length > 1 ? `Third party ${n + 1}` : 'Third party'}>
            <Field label="Driver" value={v(p?.driverName)} />
            <Field label="Phone" value={v(p?.contactNumber)} />
            <Field label="Address" value={v(p?.residentialAddress)} wide />
            <Field label="Vehicle" value={v(p?.vehicleMakeAndType)} />
            <Field label="Registration" value={v(p?.registrationNumber)} />
            <Field label="Insurer" value={v(p?.insurer)} />
            <Field label="Policy number" value={v(p?.policyNumber)} />
            <Field label="Damage" value={v(p?.vehicleDamage)} wide />
          </Section>
        ))}

        <Section title="Injured persons and witnesses">
          <Field label="Injuries" value={x ? (injuries.length ? injuries.join('; ') : 'None reported') : null} wide />
          <Field label="Witnesses" value={x ? (witnesses.length ? witnesses.join('; ') : 'None listed') : null} wide />
        </Section>

        <Section title="Attachments">
          <Field label="Police report" value={report ? 'Attached' : null} />
          <Field label="Insured’s ID" value={has('ID_COPY') ? 'Attached' : null} />
          <Field label="Driver’s licence" value={has('DRIVER_LICENCE') ? 'Attached' : null} />
          <Field label="Damage photos" value={has('DAMAGE_PHOTO') ? `${documents.filter((d) => d.type === 'DAMAGE_PHOTO').length} attached` : null} />
          <Field label="Quotations" value={`${quotes.length} of 3 attached${quotes.length < 3 ? ', the rest to follow' : ''}`} />
          <Field label="Quoted totals (read from the quotations)" value={quotedTotals.length ? quotedTotals.join('; ') : null} wide />
        </Section>

        <section className="break-inside-avoid border-2 border-ink p-4">
          <h2 className="font-display font-bold">Declaration</h2>
          <p className="mt-2 text-sm">{DECLARATION}</p>
          <p className="mt-3 text-sm">
            {i.declaredAt ? (
              <>
                Accepted on WhatsApp by <strong>{insuredName}</strong> (+{customer.phone}) on {formatDateTime(i.declaredAt)}.
              </>
            ) : (
              <span className="text-signal">Not yet accepted.</span>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
