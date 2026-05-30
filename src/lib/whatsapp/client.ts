import crypto from "crypto";
import type {
  OutgoingMessage,
  WebhookBody,
  IncomingMessage,
  WebhookContact,
} from "./types";

const META_API_BASE = "https://graph.facebook.com/v21.0";

function getConfig() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET;

  if (!token || !phoneNumberId || !verifyToken || !appSecret) {
    throw new Error(
      "Missing Meta WhatsApp env vars. Check META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET."
    );
  }

  return { token, phoneNumberId, verifyToken, appSecret };
}

/**
 * Verify webhook signature from Meta
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null
): boolean {
  if (!signature) return false;

  const { appSecret } = getConfig();
  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(body).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract messages from webhook payload
 */
export function extractMessages(body: WebhookBody): Array<{
  message: IncomingMessage;
  contact: WebhookContact | undefined;
  phoneNumberId: string;
}> {
  const results: Array<{
    message: IncomingMessage;
    contact: WebhookContact | undefined;
    phoneNumberId: string;
  }> = [];

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const { messages, contacts, metadata } = change.value;
      if (!messages) continue;

      for (const message of messages) {
        const contact = contacts?.find((c) => c.wa_id === message.from);
        results.push({
          message,
          contact,
          phoneNumberId: metadata.phone_number_id,
        });
      }
    }
  }

  return results;
}

/**
 * Parsed message with structured interaction data
 */
export interface ParsedMessage {
  text: string | null;
  type: "text" | "button_reply" | "list_reply" | "image" | "audio" | "other";
  interactionId?: string;
}

/**
 * Get the text content from any message type (legacy — returns text only)
 */
export function getMessageText(message: IncomingMessage): string | null {
  return parseMessage(message).text;
}

/**
 * Parse a message into structured data with interaction ID
 */
export function parseMessage(message: IncomingMessage): ParsedMessage {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? null, type: "text" };
    case "interactive":
      if (message.interactive?.type === "button_reply") {
        return {
          text: message.interactive.button_reply?.title ?? null,
          type: "button_reply",
          interactionId: message.interactive.button_reply?.id,
        };
      }
      if (message.interactive?.type === "list_reply") {
        return {
          text: message.interactive.list_reply?.title ?? null,
          type: "list_reply",
          interactionId: message.interactive.list_reply?.id,
        };
      }
      return { text: null, type: "other" };
    case "image":
      return {
        text: message.image?.caption ?? "[Customer sent an image]",
        type: "image",
      };
    case "audio":
      return {
        text: "[Customer sent a voice message — voice messages are not supported yet. Please type your message.]",
        type: "audio",
      };
    default:
      return { text: null, type: "other" };
  }
}

/**
 * Send a message via WhatsApp Cloud API
 */
export async function sendMessage(message: OutgoingMessage): Promise<{ messageId: string }> {
  const { token, phoneNumberId } = getConfig();

  const response = await fetch(
    `${META_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("WhatsApp API error:", JSON.stringify(error, null, 2));
    throw new Error(
      `WhatsApp API error: ${response.status} — ${JSON.stringify(error)}`
    );
  }

  const data = await response.json();
  return { messageId: data.messages?.[0]?.id ?? "unknown" };
}

/**
 * Send a text reply to a customer
 */
export async function sendTextReply(to: string, text: string) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

/**
 * Send interactive buttons (max 3 buttons, max 20 chars each)
 */
export async function sendButtonMessage(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply" as const,
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Send interactive list message (for menus, item selection)
 */
export async function sendListMessage(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: r.description?.slice(0, 72),
          })),
        })),
      },
    },
  });
}

/**
 * Forward order details to the seller's WhatsApp
 */
export async function notifySeller(orderSummary: string) {
  const sellerNumber = process.env.SELLER_WHATSAPP_NUMBER;
  if (!sellerNumber) {
    console.error("SELLER_WHATSAPP_NUMBER not configured");
    return;
  }

  return sendTextReply(sellerNumber, orderSummary);
}

/**
 * Mark a message as read (blue ticks)
 */
export async function markAsRead(messageId: string) {
  const { token, phoneNumberId } = getConfig();

  await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch((err) => {
    // Non-critical — don't fail the whole flow if read receipt fails
    console.error("Failed to mark message as read:", err);
  });
}
