import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  extractMessages,
  parseMessage,
  sendTextReply,
  sendButtonMessage,
  sendListMessage,
  notifySeller,
  markAsRead,
} from "@/lib/whatsapp/client";
import type { WebhookBody } from "@/lib/whatsapp/types";
import { groqFallbackReply } from "@/lib/ai/groq-fallback";
import { embroideryFallbackReply } from "@/lib/ai/embroidery-fallback";
import {
  handleEmbroideryFlowStep,
  emptyEmbroideryFlowData,
  type EmbroideryFlowData,
  type EmbroideryFlowState,
} from "@/lib/flow/embroidery-flow";
import {
  getOrCreateConversation,
  storeMessage,
  getConversationHistory,
  getFlowState,
  updateFlowState,
  messageExists,
} from "@/lib/db/queries";
import {
  getLatestActiveFoodOrder,
  updateFoodOrderStatus,
} from "@/lib/db/food-queries";
import { reportFailure } from "@/lib/monitoring";
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

      // Idempotency: Meta retries webhook deliveries. If we've already stored
      // this message id, skip it so a retry can't double-process an order.
      if (message.id && (await messageExists(message.id))) {
        console.log(`Skipping duplicate message ${message.id}`);
        continue;
      }

      // Messages from the seller's own number are order-status commands, not
      // customer orders (and must never loop back into the ordering flow).
      const sellerNumber = process.env.SELLER_WHATSAPP_NUMBER;
      if (sellerNumber && customerPhone === sellerNumber) {
        try {
          await handleSellerReply(parsed.text, sellerNumber);
        } catch (err) {
          await reportFailure("seller_reply_failed", { error: String(err) });
        }
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

          // ── Layer 3: AI fallback ──
          // The flow couldn't parse this message (e.g. messy Tanglish item).
          // Ask Groq for a menu-grounded reply instead of the canned message.
          let messagesToSend = flowResult.messages;
          if (flowResult.needsAI && parsed.text) {
            const history = await getConversationHistory(conversation.id);
            const ai = await groqFallbackReply(parsed.text, {
              mealType:
                (flow_data as unknown as FlowData)?.meal_type ?? null,
              history: history.slice(0, -1),
            });
            messagesToSend = [{ type: "text", text: ai.reply }];
          }

          // Save updated flow state
          await updateFlowState(
            conversation.id,
            flowResult.newState,
            flowResult.newData as unknown as Record<string, unknown>
          );

          // Send all response messages
          for (const msg of messagesToSend) {
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
          // ── Embroidery bot: flow-based with interactive messages ──
          const { flow_state, flow_data } = await getFlowState(conversation.id);

          const flowResult = await handleEmbroideryFlowStep(
            flow_state as EmbroideryFlowState,
            (flow_data as unknown as EmbroideryFlowData) ??
              emptyEmbroideryFlowData(),
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

          // ── Layer 3: AI fallback ──
          // The flow couldn't parse this message — ask Groq for a catalog-grounded
          // reply instead of the canned message.
          let messagesToSend = flowResult.messages;
          if (flowResult.needsAI && parsed.text) {
            const history = await getConversationHistory(conversation.id);
            const ai = await embroideryFallbackReply(parsed.text, {
              history: history.slice(0, -1),
            });
            messagesToSend = [{ type: "text", text: ai.reply }];
          }

          // Save updated flow state
          await updateFlowState(
            conversation.id,
            flowResult.newState,
            flowResult.newData as unknown as Record<string, unknown>
          );

          // Send all response messages
          for (const msg of messagesToSend) {
            await sendFlowMessage(customerPhone, msg);
            await storeMessage(conversation.id, "outbound", msg.text, "text");
          }

          // Notify seller if order confirmed
          if (flowResult.orderConfirmed && flowResult.orderSummary) {
            console.log("Embroidery order confirmed — notifying seller");
            await notifySeller(
              flowResult.orderSummary + `\nCustomer phone: ${customerPhone}`
            );
          }
        }

        console.log(`Reply sent to ${customerPhone}`);
      } catch (err) {
        await reportFailure("message_processing_failed", {
          customerPhone,
          error: String(err),
        });

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
    await reportFailure("webhook_handler_error", { error: String(err) });
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

/**
 * Handle a WhatsApp reply from the seller's own number as an order-status
 * command. Recognized keywords advance the most recent active food order and
 * notify that order's customer; unrecognized text is ignored.
 *
 * Routing heuristic: the single most-recent active order. This is right for a
 * low-volume single kitchen (our P0 customer). For higher concurrency, move to
 * per-order reply codes included in the seller notification.
 */
async function handleSellerReply(
  text: string,
  sellerNumber: string
): Promise<void> {
  // Only the food bot has a food-order status lifecycle.
  if ((process.env.BOT_MODE || "embroidery") !== "food") return;

  const biz = process.env.SELLER_BUSINESS_NAME || "the kitchen";
  const t = text.trim().toLowerCase();

  let status: string | null = null;
  let customerMsg: string | null = null;

  if (/\b(accept|accepted|preparing|prep|cooking|started)\b/.test(t)) {
    status = "preparing";
    customerMsg = `Good news! ${biz} has started preparing your order.`;
  } else if (/\b(out|dispatch|dispatched|otw|sent)\b/.test(t)) {
    status = "out_for_delivery";
    customerMsg = "Your order is out for delivery! It'll reach you shortly.";
  } else if (/\b(done|ready|delivered|complete|completed)\b/.test(t)) {
    status = "delivered";
    customerMsg = `Your order has been delivered. Nandri! Please order from ${biz} again soon.`;
  }

  if (!status || !customerMsg) return; // not a recognized command

  const order = await getLatestActiveFoodOrder();
  if (!order) {
    await sendTextReply(sellerNumber, "No active order to update right now.");
    return;
  }

  await updateFoodOrderStatus(order.id, status);
  await sendTextReply(order.customer_phone, customerMsg);
  await sendTextReply(
    sellerNumber,
    `Updated order for ${order.customer_name ?? order.customer_phone} → "${status}". Customer notified.`
  );
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
