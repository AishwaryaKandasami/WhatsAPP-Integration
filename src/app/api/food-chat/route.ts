import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrCreateConversation,
  storeMessage,
  getFlowState,
  updateFlowState,
  getConversationHistory,
} from "@/lib/db/queries";
import {
  handleFlowStep,
  emptyFlowData,
  type FlowData,
  type FlowState,
  type FlowMessage,
  type MessageInput,
} from "@/lib/flow/food-flow";
import { groqFallbackReply } from "@/lib/ai/groq-fallback";

// Validate the request body up front so malformed input, oversized text, or a
// 5,000-char "address" can never reach the flow engine or the database.
const foodChatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  sessionId: z.string().max(200).optional(),
  interactionId: z.string().max(200).optional(),
  interactionType: z.enum(["button_reply", "list_reply", "text"]).optional(),
});

/**
 * POST /api/food-chat
 *
 * Food business demo chat endpoint.
 * Uses flow-based state machine — no AI calls for structured interactions.
 */
export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = foodChatSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, sessionId, interactionId, interactionType } = parsed.data;

    // Each browser session gets a unique conversation
    const demoPhone = `demo-${sessionId || crypto.randomUUID()}`;

    // Get or create conversation (30-min timeout)
    const conversation = await getOrCreateConversation(
      demoPhone,
      "Food Demo Customer"
    );

    // Store the incoming message
    await storeMessage(conversation.id, "inbound", message, "text");

    // Get current flow state
    const { flow_state, flow_data } = await getFlowState(conversation.id);

    // Run through the flow engine.
    // interactionType/interactionId arrive when the user TAPS a button or list
    // row in the demo UI (mirrors WhatsApp interactive replies).
    const flowResult = await handleFlowStep(
      flow_state as FlowState,
      (flow_data as unknown as FlowData) ?? emptyFlowData(),
      {
        text: message,
        type: (interactionType as MessageInput["type"]) || "text",
        interactionId: interactionId || undefined,
      },
      {
        conversationId: conversation.id,
        customerPhone: demoPhone,
        customerName: "Food Demo Customer",
      }
    );

    // ── Layer 3: AI fallback ──
    // Flow couldn't parse the message — get a menu-grounded Groq reply.
    let messagesToSend: FlowMessage[] = flowResult.messages;
    if (flowResult.needsAI) {
      const history = await getConversationHistory(conversation.id);
      const ai = await groqFallbackReply(message, {
        mealType: (flow_data as unknown as FlowData)?.meal_type ?? null,
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

    // Combine all flow messages into a single text reply for the demo page
    // (Demo page doesn't support buttons/lists — render as text)
    const replyParts: string[] = [];
    for (const msg of messagesToSend) {
      replyParts.push(msg.text);

      // Render buttons as text options for demo
      if (msg.type === "buttons" && msg.buttons) {
        const options = msg.buttons.map((b) => `  > ${b.title}`).join("\n");
        replyParts.push(options);
      }

      // Render list items as text for demo
      if (msg.type === "list" && msg.listSections) {
        for (const section of msg.listSections) {
          for (const row of section.rows) {
            replyParts.push(`  - ${row.title}: ${row.description ?? ""}`);
          }
        }
        replyParts.push("\nType the item name to select it.");
      }
    }

    const reply = replyParts.join("\n\n");

    // Store bot reply
    await storeMessage(conversation.id, "outbound", reply, "text");

    return NextResponse.json({
      reply,
      messages: messagesToSend,
      conversationId: conversation.id,
      orderConfirmed: flowResult.orderConfirmed ?? false,
      orderSummary: flowResult.orderSummary ?? null,
    });
  } catch (error) {
    console.error("Food chat error:", error);

    const apiErr = error as { status?: number };
    if (apiErr.status === 429) {
      return NextResponse.json(
        {
          error: "Daily request limit reached. Please try again tomorrow.",
          details: "Free tier allows 20 requests/day.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
