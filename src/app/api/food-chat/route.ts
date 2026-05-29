import { NextRequest, NextResponse } from "next/server";
import { processFoodMessage } from "@/lib/ai/food-conversation";
import {
  getOrCreateConversation,
  storeMessage,
  getConversationHistory,
} from "@/lib/db/queries";

const FOOD_TEST_PHONE = "food-demo-user";

/**
 * POST /api/food-chat
 *
 * Food business demo chat endpoint.
 * Saves to the same Supabase DB.
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

    // Get or create a conversation for the food demo user
    const conversation = await getOrCreateConversation(
      FOOD_TEST_PHONE,
      "Food Demo Customer"
    );

    // Store the incoming message
    await storeMessage(conversation.id, "inbound", message, "text");

    // Get conversation history from DB
    const history = await getConversationHistory(conversation.id);

    // Process through food AI
    const response = await processFoodMessage(
      message,
      history,
      "Food Demo Customer",
      { conversationId: conversation.id, customerPhone: FOOD_TEST_PHONE }
    );

    // Store the bot reply
    await storeMessage(conversation.id, "outbound", response.reply, "text");

    return NextResponse.json({
      reply: response.reply,
      orderConfirmed: response.orderConfirmed,
      orderSummary: response.orderSummary,
    });
  } catch (error) {
    console.error("Food chat error:", error);
    return NextResponse.json(
      { error: "AI processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
