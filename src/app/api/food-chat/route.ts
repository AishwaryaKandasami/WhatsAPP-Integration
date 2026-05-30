import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateConversation,
  storeMessage,
  getFlowState,
  updateFlowState,
} from "@/lib/db/queries";
import {
  handleFlowStep,
  emptyFlowData,
  type FlowData,
  type FlowState,
} from "@/lib/flow/food-flow";

/**
 * POST /api/food-chat
 *
 * Food business demo chat endpoint.
 * Uses flow-based state machine — no AI calls for structured interactions.
 */
export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing 'message' in request body" },
        { status: 400 }
      );
    }

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

    // Run through the flow engine
    const flowResult = await handleFlowStep(
      flow_state as FlowState,
      (flow_data as unknown as FlowData) ?? emptyFlowData(),
      { text: message, type: "text" },
      {
        conversationId: conversation.id,
        customerPhone: demoPhone,
        customerName: "Food Demo Customer",
      }
    );

    // Save updated flow state
    await updateFlowState(
      conversation.id,
      flowResult.newState,
      flowResult.newData as unknown as Record<string, unknown>
    );

    // Combine all flow messages into a single text reply for the demo page
    // (Demo page doesn't support buttons/lists — render as text)
    const replyParts: string[] = [];
    for (const msg of flowResult.messages) {
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
