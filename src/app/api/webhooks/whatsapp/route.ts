import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  extractMessages,
  getMessageText,
  sendTextReply,
  notifySeller,
  markAsRead,
} from "@/lib/whatsapp/client";
import type { WebhookBody } from "@/lib/whatsapp/types";
import { processMessage } from "@/lib/ai/conversation";
import {
  getOrCreateConversation,
  storeMessage,
  getConversationHistory,
} from "@/lib/db/queries";

/**
 * GET /api/webhooks/whatsapp
 * Meta sends a GET request to verify the webhook during setup.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("Webhook verification failed", { mode, token });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp
 * Meta sends incoming messages here.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // 1. Verify signature
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body: WebhookBody = JSON.parse(rawBody);

    // 2. Extract messages
    const incoming = extractMessages(body);

    if (incoming.length === 0) {
      // Could be a status update (delivered, read) — acknowledge silently
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // 3. Process each message
    for (const { message, contact } of incoming) {
      // Skip non-processable message types
      const messageText = getMessageText(message);
      if (!messageText) {
        console.log(`Skipping message type: ${message.type}`);
        continue;
      }

      const customerPhone = message.from;
      const customerName = contact?.profile?.name ?? "Customer";

      console.log(
        `Message from ${customerName} (${customerPhone}): ${messageText.slice(0, 100)}`
      );

      // Don't process messages from the seller's own number (avoid loops)
      const sellerNumber = process.env.SELLER_WHATSAPP_NUMBER;
      if (sellerNumber && customerPhone === sellerNumber) {
        console.log("Ignoring message from seller number");
        continue;
      }

      try {
        // Mark as read (blue ticks)
        await markAsRead(message.id);

        // 4. Get or create conversation
        const conversation = await getOrCreateConversation(
          customerPhone,
          customerName
        );

        // 5. Store incoming message
        await storeMessage(
          conversation.id,
          "inbound",
          messageText,
          message.type,
          message.id
        );

        // 6. Get conversation history for context
        const history = await getConversationHistory(conversation.id);

        // 7. Process through AI
        const aiResponse = await processMessage(
          messageText,
          history,
          customerName
        );

        // 8. Send reply to customer
        const { messageId: replyMessageId } = await sendTextReply(
          customerPhone,
          aiResponse.reply
        );

        // 9. Store outgoing message
        await storeMessage(
          conversation.id,
          "outbound",
          aiResponse.reply,
          "text",
          replyMessageId
        );

        // 10. If order was created, notify seller
        if (aiResponse.orderCreated && aiResponse.orderSummary) {
          console.log("Order created — notifying seller");
          await notifySeller(
            aiResponse.orderSummary +
              `\nCustomer phone: ${customerPhone}`
          );
        }

        console.log(`Reply sent to ${customerPhone}`);
      } catch (err) {
        console.error(`Error processing message from ${customerPhone}:`, err);

        // Send a fallback error message to the customer
        try {
          await sendTextReply(
            customerPhone,
            "Sorry, I'm having trouble right now. Please try again in a moment, or contact us directly."
          );
        } catch {
          console.error("Failed to send error message");
        }
      }
    }

    // Always return 200 quickly — Meta retries on non-200
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
