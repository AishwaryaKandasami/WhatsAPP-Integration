// Meta WhatsApp Cloud API types

export interface WebhookBody {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: WebhookContact[];
    messages?: IncomingMessage[];
    statuses?: MessageStatus[];
  };
  field: string;
}

export interface WebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface IncomingMessage {
  from: string; // sender phone number
  id: string; // message ID
  timestamp: string;
  type: "text" | "image" | "interactive" | "button" | "location" | "audio" | "video" | "document";
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}

export interface MessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

// Outgoing message types
export interface SendTextMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface SendImageMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "image";
  image: {
    link: string;
    caption?: string;
  };
}

export interface SendInteractiveButtonMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    body: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: "reply";
        reply: {
          id: string;
          title: string; // max 20 chars
        };
      }>;
    };
  };
}

export interface SendInteractiveListMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    body: {
      text: string;
    };
    action: {
      button: string; // max 20 chars — the CTA text
      sections: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string; // max 24 chars
          description?: string; // max 72 chars
        }>;
      }>;
    };
  };
}

export type OutgoingMessage =
  | SendTextMessage
  | SendImageMessage
  | SendInteractiveButtonMessage
  | SendInteractiveListMessage;
