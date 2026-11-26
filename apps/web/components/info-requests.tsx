import { STATUS_LABEL, formatDateTime } from '@/lib/format';
import type { ClaimDocument, ClaimEvent } from '@/lib/types';

type Item =
  | { kind: 'request'; event: ClaimEvent; note: string; delivery?: { ok: boolean; reason?: string } }
  | { kind: 'text'; event: ClaimEvent; text: string }
  | { kind: 'file'; event: ClaimEvent; doc: ClaimDocument }
  | { kind: 'resumed'; event: ClaimEvent };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function buildThread(events: ClaimEvent[], documents: ClaimDocument[]): Item[] {
  const docs = new Map(documents.map((d) => [d.id, d]));
  const items: Item[] = [];
  for (const e of events) {
    const d = e.data ?? {};
    const last = items.at(-1);
    if (e.type === 'STATUS_CHANGED' && e.toStatus === 'ADDITIONAL_INFO_REQUIRED') {
      items.push({ kind: 'request', event: e, note: str(d.note) });
    } else if (items.length === 0) {
      continue;
    } else if ((e.type === 'CUSTOMER_NOTIFIED' || e.type === 'CUSTOMER_NOTIFY_FAILED') && last?.kind === 'request' && !last.delivery) {
      last.delivery = { ok: e.type === 'CUSTOMER_NOTIFIED', reason: str(d.reason) || undefined };
    } else if (e.type === 'CUSTOMER_REPLY') {
      items.push({ kind: 'text', event: e, text: str(d.text) });
    } else if (e.type === 'DOCUMENT_ADDED' && e.actorType === 'CUSTOMER') {
      const doc = docs.get(str(d.documentId));
      if (doc && doc.type === 'OTHER') items.push({ kind: 'file', event: e, doc });
    } else if (e.type === 'STATUS_CHANGED' && e.fromStatus === 'ADDITIONAL_INFO_REQUIRED') {
      items.push({ kind: 'resumed', event: e });
    }
  }
  return items;
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function InfoRequests({ claimId, items }: { claimId: string; items: Item[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item) => {
        const when = formatDateTime(item.event.createdAt);
        switch (item.kind) {
          case 'request':
            return (
              <li key={item.event.id} className="rounded-md border-l-4 border-amber bg-amber-soft px-4 py-3">
                <p className="text-sm text-slate">
                  {item.event.actorName} asked, {when}
                </p>
                <p className="mt-1 whitespace-pre-line">{item.note}</p>
                {item.delivery &&
                  (item.delivery.ok ? (
                    <p className="mt-2 text-sm text-go">Sent to the customer on WhatsApp</p>
                  ) : (
                    <p className="mt-2 text-sm text-signal">
                      Not delivered on WhatsApp: {item.delivery.reason ?? 'unknown error'}. Contact the customer another way.
                    </p>
                  ))}
              </li>
            );
          case 'text':
            return (
              <li key={item.event.id} className="ml-6 rounded-md bg-paper px-4 py-3">
                <p className="text-sm text-slate">Customer replied, {when}</p>
                <p className="mt-1 whitespace-pre-line">{item.text}</p>
              </li>
            );
          case 'file': {
            const href = `/api/documents/${claimId}/${item.doc.id}`;
            const isImage = item.doc.mimeType.startsWith('image/');
            return (
              <li key={item.event.id} className="ml-6 rounded-md bg-paper px-4 py-3">
                <p className="text-sm text-slate">Customer sent {isImage ? 'a photo' : 'a file'}, {when}</p>
                <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                  {isImage ? (
                    <img
                      src={href}
                      alt={`Photo sent by the customer at ${when}`}
                      className="h-32 w-auto rounded border border-line object-cover"
                    />
                  ) : (
                    <span className="underline underline-offset-4">
                      PDF, {kb(item.doc.bytes)}
                    </span>
                  )}
                </a>
              </li>
            );
          }
          case 'resumed': {
            const back = item.event.toStatus ? ` Back to ${STATUS_LABEL[item.event.toStatus].toLowerCase()}.` : '';
            return (
              <li key={item.event.id} className="text-sm text-slate">
                {item.event.actorType === 'CUSTOMER'
                  ? `Customer tapped Done, ${when}.${back}`
                  : `${item.event.actorName} resumed without waiting, ${when}.${back}`}
              </li>
            );
          }
        }
      })}
    </ol>
  );
}
