import type { ClaimDocument, ClaimIntake, QuotationExtraction } from '@/lib/types';
import { formatDateTime } from '@/lib/format';

export const STATEMENT_DOC_TYPES = new Set(['DRIVER_LICENCE', 'ID_COPY', 'SKETCH', 'DAMAGE_PHOTO', 'QUOTATION']);

const QUOTES_WANTED = 3;
const LOW_CONFIDENCE = 0.7;

const money = (amount: number, currency: string | null) =>
  `${currency ?? ''} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

function Quotations({ claimId, quotes, intake }: { claimId: string; quotes: ClaimDocument[]; intake: ClaimIntake }) {
  const rows = quotes.map((doc) => ({ doc, x: doc.extraction as unknown as QuotationExtraction | null }));
  const totals = rows.filter((r) => typeof r.x?.total.value === 'number');
  const currencies = new Set(totals.map((r) => r.x?.currency.value ?? ''));
  const lowest =
    totals.length >= 2 && currencies.size === 1
      ? totals.reduce((a, b) => ((b.x!.total.value as number) < (a.x!.total.value as number) ? b : a)).doc.id
      : null;

  return (
    <div>
      <h3 className="font-semibold">
        Quotations <span className="font-normal text-slate">{quotes.length} of {QUOTES_WANTED}</span>
      </h3>
      {quotes.length < QUOTES_WANTED && (
        <p className="mt-2 rounded-md border-l-4 border-amber bg-amber-soft px-4 py-3 text-sm">
          {quotes.length === 0 ? 'No quotations yet.' : `${QUOTES_WANTED - quotes.length} more needed.`}{' '}
          {intake.quotesLater || intake.quotesDone ? 'The customer said they will send the rest later. ' : ''}
          Ask for them with “Ask customer for more information”; quotations they send are counted here.
        </p>
      )}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate">
              <tr>
                <th className="py-2 pr-4 font-medium">Quote</th>
                <th className="py-2 pr-4 font-medium">Supplier</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 text-right font-medium">Total read</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ doc, x }, n) => {
                const href = `/api/documents/${claimId}/${doc.id}`;
                const total = x?.total;
                const unsure = !total || total.value === null || total.confidence < LOW_CONFIDENCE;
                return (
                  <tr key={doc.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4">
                      <a href={href} target="_blank" rel="noreferrer" className="block w-16">
                        {doc.mimeType.startsWith('image/') ? (
                          <img src={href} alt={`Quotation ${n + 1}`} className="h-12 w-16 rounded border border-line object-cover" />
                        ) : (
                          <span className="underline underline-offset-4">PDF</span>
                        )}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{x?.supplier.value ?? <span className="text-slate">Not read</span>}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{x?.quoteDate.value ?? <span className="text-slate">Not read</span>}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {typeof total?.value === 'number' ? (
                        <span
                          className={unsure ? 'rounded bg-amber-soft px-1.5 py-0.5 text-[#7a5a05]' : 'font-semibold'}
                          title={total.sourceText ? `Read as “${total.sourceText}”` : undefined}
                        >
                          {money(total.value, x?.currency.value ?? null)}
                        </span>
                      ) : (
                        <span className="text-signal">Not read, check the photo</span>
                      )}
                      {doc.id === lowest && <span className="ml-2 rounded-full bg-go-soft px-2 py-0.5 text-xs font-medium text-go">Lowest</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate">Totals are read from the photos. Amber totals were read with low confidence; check them against the photo.</p>
        </div>
      )}
    </div>
  );
}

const byOldest = (a: ClaimDocument, b: ClaimDocument) => a.createdAt.localeCompare(b.createdAt);

function Thumb({ claimId, doc, label }: { claimId: string; doc: ClaimDocument; label: string }) {
  const href = `/api/documents/${claimId}/${doc.id}`;
  return (
    <figure>
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {doc.mimeType.startsWith('image/') ? (
          <img src={href} alt={label} className="h-32 w-full rounded border border-line bg-paper object-cover" />
        ) : (
          <span className="flex h-32 items-center justify-center rounded border border-line bg-paper text-sm underline underline-offset-4">
            Open PDF
          </span>
        )}
      </a>
      <figcaption className="mt-1 text-sm text-slate">{label}</figcaption>
    </figure>
  );
}

export function ClaimStatement({
  claimId,
  intake,
  description,
  documents,
}: {
  claimId: string;
  intake: ClaimIntake;
  description: string | null;
  documents: ClaimDocument[];
}) {
  const of = (type: string) => documents.filter((d) => d.type === type).sort(byOldest);
  const licence = of('DRIVER_LICENCE');
  const id = of('ID_COPY');
  const sketch = of('SKETCH');
  const damage = of('DAMAGE_PHOTO');
  const quotes = of('QUOTATION');
  const story = intake.description ?? description;

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-slate">Driver</dt>
          <dd className="mt-1">
            {intake.driver === 'INSURED' ? 'The insured' : (intake.driverName ?? 'Not given')}
            {intake.driver === 'OTHER' && intake.driverPhone && (
              <span className="block text-sm text-slate">{intake.driverPhone}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate">Speed</dt>
          <dd className="mt-1">{intake.speedKmh !== undefined ? `${intake.speedKmh} km/h` : 'Not given'}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate">Weather</dt>
          <dd className="mt-1">{intake.weather ?? 'Not given'}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-sm text-slate">What happened, in the customer’s words</dt>
          <dd className="mt-1 max-w-prose whitespace-pre-line">{story ?? 'Not given'}</dd>
        </div>
      </dl>

      {intake.sketchSkipped && sketch.length === 0 && (
        <p className="rounded-md border-l-4 border-amber bg-amber-soft px-4 py-3 text-sm">
          The customer skipped the sketch. Ask for one if the police report doesn’t make the collision clear.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {licence.map((d, i) => (
          <Thumb key={d.id} claimId={claimId} doc={d} label={`Licence, ${i === 0 ? 'front' : i === 1 ? 'back' : `extra ${i - 1}`}`} />
        ))}
        {id.map((d) => (
          <Thumb key={d.id} claimId={claimId} doc={d} label="ID" />
        ))}
        {sketch.map((d) => (
          <Thumb key={d.id} claimId={claimId} doc={d} label="Sketch" />
        ))}
        {damage.map((d, i) => (
          <Thumb key={d.id} claimId={claimId} doc={d} label={`Damage ${i + 1}`} />
        ))}
      </div>

      <Quotations claimId={claimId} quotes={quotes} intake={intake} />

      {intake.declaredAt && (
        <p className="text-sm text-slate">Declaration accepted on WhatsApp, {formatDateTime(intake.declaredAt)}.</p>
      )}
    </div>
  );
}
