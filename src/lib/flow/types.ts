// Shared message types for all flow-based bots (food, embroidery, ...).
//
// A FlowMessage is what a flow handler emits. The web demo renders it as
// clickable buttons / list rows, and the WhatsApp webhook maps it to Meta
// interactive messages. MessageInput is the normalised inbound message (a typed
// text, or a button/list tap carrying an interactionId).

export interface MessageInput {
  text: string | null;
  type: "text" | "button_reply" | "list_reply" | "image" | "audio" | "other";
  interactionId?: string;
}

export interface FlowMessage {
  type: "text" | "buttons" | "list";
  text: string;
  buttons?: Array<{ id: string; title: string }>;
  listSections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description: string }>;
  }>;
  listButtonText?: string;
}
