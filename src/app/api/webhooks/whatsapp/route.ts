import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  extractMessages,
  getMessageText,
  parseMessage,
  sendTextReply,
  sendButtonMessage,
  sendListMessage,
  notifySeller,
  markAsRead,
} from "@/lib/whatsapp/client";
import type { WebhookBody } from "@/lib/whatsapp/types";
import { processMessage } from "@/lib/ai/conversation";
import {
  getOrCreateConversation,
  storeMessage,
  getConversationHistory,
  getFlowState,
  updateFlowState,
} from "@/lib/db/queries";
import { handleFlowStep, emptyFlowData, type FlowData, type FlowState, type FlowMessage } from "@/lib/flow/food-flow";

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
      // Parse message with structured interaction data
      const parsed = parseMessage(message);
      if (!parsed.text) {
        console.log(`Skipping message type: ${message.type}`);
        continue;
      }

      const customerPhone = message.from;
      const customerName = contact?.profile?.name ?? "Customer";

      console.log(
        `Message from ${customerName} (${customerPhone}): ${parsed.text.slice(0, 100)}`
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

        // 4. Get or create conversation (with 30-min session timeout)
        const conversation = await getOrCreateConversation(
          customerPhone,
          customerName
        );

        // 5. Store incoming message
        await storeMessage(
          conversation.id,
          "inbound",
          parsed.text,
          message.type,
          message.id
        );

        // 7. Process based on BOT_MODE
        const botMode = process.env.BOT_MODE || "embroidery";

        if (botMode === "food") {
          // ── Food bot: flow-based with interactive messages ──
          const { flow_state, flow_data } = await getFlowState(conversation.id);

          const flowResult = await handleFlowStep(
            flow_state as FlowState,
            (flow_data as unknown as FlowData) ?? emptyFlowData(),
            {
              text: parsed.text,
              type: parsed.type,
              interactionId: parsed.interactionId,
            },
            {
              customerPhone,
              conversationId: conversation.id,
              customerName,
            }
          );

          // Save updated flow state
          await updateFlowState(
            conversation.id,
            flowResult.newState,
            flowResult.newData as unknown as Record<string, unknown>
          );

          // Send all response messages
          for (const msg of flowResult.messages) {
            await sendFlowMessage(customerPhone, msg);

            // Store outbound message
            await storeMessage(
              conversation.id,
              "outbound",
              msg.text,
              "text"
            );
          }

          // Notify seller if order confirmed
          if (flowResult.orderConfirmed && flowResult.orderSummary) {
            console.log("Food order confirmed — notifying seller");
            await notifySeller(
              flowResult.orderSummary +
                `\nCustomer phone: ${customerPhone}`
            );
          }
        } else {
          // ── Embroidery bot flow (default — still AI-based) ──
          const history = await getConversationHistory(conversation.id);

          const aiResponse = await processMessage(
            parsed.text,
            history,
            customerName
          );

          const { messageId: replyMessageId } = await sendTextReply(
            customerPhone,
            aiResponse.reply
          );

          await storeMessage(
            conversation.id,
            "outbound",
            aiResponse.reply,
            "text",
            replyMessageId
          );

          if (aiResponse.orderCreated && aiResponse.orderSummary) {
            console.log("Order created — notifying seller");
            await notifySeller(
              aiResponse.orderSummary +
                `\nCustomer phone: ${customerPhone}`
            );
          }
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

/**
 * Send a flow message (text, buttons, or list) via WhatsApp
 */
async function sendFlowMessage(to: string, msg: FlowMessage) {
  switch (msg.type) {
    case "buttons":
      if (msg.buttons && msg.buttons.length > 0) {
        return sendButtonMessage(to, msg.text, msg.buttons);
      }
      return sendTextReply(to, msg.text);

    case "list":
      if (msg.listSections && msg.listSections.length > 0) {
        return sendListMessage(
          to,
          msg.text,
          msg.listButtonText ?? "View Options",
          msg.listSections
        );
      }
      return sendTextReply(to, msg.text);

    case "text":
    default:
      return sendTextReply(to, msg.text);
  }
}
