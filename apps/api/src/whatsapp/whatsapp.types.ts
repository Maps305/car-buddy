export type MediaKind = 'image' | 'document' | 'audio' | 'video' | 'sticker';

export interface InboundMedia {
  id: string;
  kind: MediaKind;
  mimeType: string;
  filename?: string;
  caption?: string;
}

export interface InboundMessage {
  id: string;
  from: string;
  profileName?: string;
  timestamp: Date;
  text?: string;
  media?: InboundMedia;
  buttonId?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  unsupportedType?: string;
}

interface WebhookMediaPayload {
  id: string;
  mime_type: string;
  caption?: string;
  filename?: string;
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WebhookMediaPayload;
  document?: WebhookMediaPayload;
  audio?: WebhookMediaPayload;
  video?: WebhookMediaPayload;
  sticker?: WebhookMediaPayload;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { payload: string; text: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface WebhookPayload {
  object?: string;
  entry?: {
    id: string;
    changes?: {
      field: string;
      value: {
        metadata?: { phone_number_id: string; display_phone_number: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: WebhookMessage[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

export interface ReplyButton {
  id: string;
  title: string;
}
