import type { InboundMessage, MediaKind, WebhookMessage, WebhookPayload } from './whatsapp.types';

const MEDIA_KINDS: MediaKind[] = ['image', 'document', 'audio', 'video', 'sticker'];

function toInbound(m: WebhookMessage, profileName?: string): InboundMessage {
  const base: InboundMessage = {
    id: m.id,
    from: m.from,
    profileName,
    timestamp: new Date(Number(m.timestamp) * 1000),
  };

  if (m.type === 'text' && m.text) return { ...base, text: m.text.body };

  const kind = MEDIA_KINDS.find((k) => k === m.type);
  const media = kind ? m[kind] : undefined;
  if (kind && media) {
    return {
      ...base,
      text: media.caption,
      media: { id: media.id, kind, mimeType: media.mime_type, filename: media.filename, caption: media.caption },
    };
  }

  if (m.type === 'interactive' && m.interactive) {
    const reply = m.interactive.button_reply ?? m.interactive.list_reply;
    if (reply) return { ...base, buttonId: reply.id, text: reply.title };
  }
  if (m.type === 'button' && m.button) return { ...base, buttonId: m.button.payload, text: m.button.text };
  if (m.type === 'location' && m.location) return { ...base, location: m.location };

  return { ...base, unsupportedType: m.type };
}

export function parseWebhook(payload: WebhookPayload): InboundMessage[] {
  if (payload.object !== 'whatsapp_business_account') return [];
  const out: InboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const names = new Map((change.value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of change.value.messages ?? []) out.push(toInbound(m, names.get(m.from)));
    }
  }
  return out;
}
