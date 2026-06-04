import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateConversation,
  storeMessage,
  getFlowState,
  updateFlowState,
  getConversationHistory,
} from "@/lib/db/queries";
import {
  handleEmbroideryFlowStep,
  emptyEmbroideryFlowData,
  type EmbroideryFlowData,
  type EmbroideryFlowState,
} from "@/lib/flow/embroidery-flow";
import type { FlowMessage, MessageInput } from "@/lib/flow/types";
import { embroideryFallbackReply } from "@/lib/ai/embroidery-fallback";

/**
 * POST /api/embroidery-chat
 *
 * Embroidery business demo chat endpoint.
 * Flow-based state machine — no AI calls for the button/list happy path.
 */
export async function POST(request: NextRequest) {
  try {
    const { message, sessionId, interactionId, interactionType } =
      await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing 'message' in request body" },
        { status: 400 }
      );
    }

    // Each browser session gets a unique conversation
    const demoPhone = `demo-${sessionId || crypto.randomUUID()}`;

    const conversation = await getOrCreateConversation(
      demoPhone,
      "Embroidery Demo Customer"
    );

    await storeMessage(conversation.id, "inbound", message, "text");

    const { flow_state, flow_data } = await getFlowState(conversation.id);

    const flowResult = await handleEmbroideryFlowStep(
      flow_state as EmbroideryFlowState,
      (flow_data as unknown as EmbroideryFlowData) ?? emptyEmbroideryFlowData(),
      {
        text: message,
        type: (interactionType as MessageInput["type"]) || "text",
        interactionId: interactionId || undefined,
      },
      {
        conversationId: conversation.id,
        customerPhone: demoPhone,
        customerName: "Embroidery Demo Customer",
      }
    );

    // ── Layer 3: AI fallback ──
    let messagesToSend: FlowMessage[] = flowResult.messages;
    if (flowResult.needsAI) {
      const history = await getConversationHistory(conversation.id);
      const ai = await embroideryFallbackReply(message, {
        history: history.slice(0, -1),
      });
      messagesToSend = [{ type: "text", text: ai.reply }];
    }

    await updateFlowState(
      conversation.id,
      flowResult.newState,
      flowResult.newData as unknown as Record<string, unknown>
    );

    // Render flow messages as a single text reply too (demo fallback rendering)
    const replyParts: string[] = [];
    for (const msg of messagesToSend) {
      replyParts.push(msg.text);
      if (msg.type === "buttons" && msg.buttons) {
        replyParts.push(msg.buttons.map((b) => `  > ${b.title}`).join("\n"));
      }
      if (msg.type === "list" && msg.listSections) {
        for (const section of msg.listSections) {
          for (const row of section.rows) {
            replyParts.push(`  - ${row.title}: ${row.description ?? ""}`);
          }
        }
        replyParts.push("\nType the name to select it.");
      }
    }
    const reply = replyParts.join("\n\n");

    await storeMessage(conversation.id, "outbound", reply, "text");

    return NextResponse.json({
      reply,
      messages: messagesToSend,
      conversationId: conversation.id,
      orderConfirmed: flowResult.orderConfirmed ?? false,
      orderSummary: flowResult.orderSummary ?? null,
    });
  } catch (error) {
    console.error("Embroidery chat error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
