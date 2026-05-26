import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/ai/conversation";
import {
  getOrCreateConversation,
  storeMessage,
  getConversationHistory,
} from "@/lib/db/queries";

const TEST_PHONE = "test-web-user";

/**
 * POST /api/test-chat
 *
 * Test endpoint to try the AI conversation without WhatsApp.
 * Saves to database so you can verify in Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing 'message' in request body" },
        { status: 400 }
      );
    }

    // Get or create a conversation for the test user
    const conversation = await getOrCreateConversation(
      TEST_PHONE,
      "Test Customer"
    );

    // Store the incoming message
    await storeMessage(conversation.id, "inbound", message, "text");

    // Get conversation history from DB (not from client)
    const history = await getConversationHistory(conversation.id);

    // Process through AI
    const response = await processMessage(message, history, "Test Customer");

    // Store the bot reply
    await storeMessage(conversation.id, "outbound", response.reply, "text");

    return NextResponse.json({
      reply: response.reply,
      orderCreated: response.orderCreated,
      orderSummary: response.orderSummary,
    });
  } catch (error) {
    console.error("Test chat error:", error);
    return NextResponse.json(
      { error: "AI processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
