import crypto from "crypto";
import type {
  OutgoingMessage,
  WebhookBody,
  IncomingMessage,
  WebhookContact,
} from "./types";
import { reportFailure } from "@/lib/monitoring";

const META_API_BASE = "https://graph.facebook.com/v21.0";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 300ms, then 900ms — brief backoff so a transient 429/5xx doesn't drop a reply.
function backoffMs(attempt: number): number {
  return 300 * Math.pow(3, attempt - 1);
}

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
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const maxAttempts = 3;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
    } catch (err) {
      // Network-level failure — always retriable.
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      await reportFailure("whatsapp_send_failed", {
        reason: "network",
        attempt,
        error: String(err),
      });
      throw err;
    }

    if (response.ok) {
      const data = await response.json();
      return { messageId: data.messages?.[0]?.id ?? "unknown" };
    }

    const errBody = await response.json().catch(() => ({}));
    lastError = new Error(
      `WhatsApp API error: ${response.status} — ${JSON.stringify(errBody)}`
    );

    // Retry only rate limits and transient server errors; fail fast on 4xx.
    const retriable = response.status === 429 || response.status >= 500;
    if (retriable && attempt < maxAttempts) {
      await sleep(backoffMs(attempt));
      continue;
    }

    await reportFailure("whatsapp_send_failed", {
      status: response.status,
      attempt,
      error: errBody,
    });
    throw lastError;
  }

  throw lastError ?? new Error("WhatsApp send failed");
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
