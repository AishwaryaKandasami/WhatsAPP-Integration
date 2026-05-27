import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { buildFoodSystemPrompt } from "./food-prompts";
import { foodFunctionDeclarations, executeFoodTool } from "./food-tools";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FoodAIResponse {
  reply: string;
  orderConfirmed: boolean;
  orderSummary: string | null;
}

/**
 * Process a customer message through Gemini for the food business.
 */
export async function processFoodMessage(
  customerMessage: string,
  conversationHistory: ConversationMessage[],
  customerName: string
): Promise<FoodAIResponse> {
  const systemPrompt = buildFoodSystemPrompt();

  const contents: Content[] = [];

  // Add conversation history
  for (const msg of conversationHistory.slice(-10)) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  }

  // Add current message
  contents.push({
    role: "user",
    parts: [{ text: customerMessage }],
  });

  let orderConfirmed = false;
  let orderSummary: string | null = null;

  const config = {
    tools: [{ functionDeclarations: foodFunctionDeclarations }],
  };

  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Retry on temporary errors
    let response;
    for (let retry = 0; retry < 3; retry++) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            ...config,
            systemInstruction: systemPrompt,
          },
        });
        break;
      } catch (err: unknown) {
        const apiErr = err as { status?: number };
        if ((apiErr.status === 503 || apiErr.status === 429) && retry < 2) {
          console.log(`Gemini ${apiErr.status} error, retrying in ${(retry + 1) * 2}s...`);
          await new Promise((r) => setTimeout(r, (retry + 1) * 2000));
          continue;
        }
        throw err;
      }
    }
    if (!response) throw new Error("Gemini call failed after retries");

    // Check if Gemini wants to call functions
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionCall = response.functionCalls[0];
      console.log(`[Food] Tool call: ${functionCall.name}`, JSON.stringify(functionCall.args));

      const toolResult = executeFoodTool(
        functionCall.name!,
        (functionCall.args ?? {}) as Record<string, unknown>
      );

      // Track order confirmation
      if (functionCall.name === "confirm_order") {
        const result = toolResult as {
          success?: boolean;
          order_id?: string;
          summary?: Record<string, unknown>;
        };
        if (result.success) {
          orderConfirmed = true;
          orderSummary = formatFoodOrderForSeller(
            result.order_id as string,
            result.summary as Record<string, unknown>,
            customerName
          );
        }
      }

      // Add model's function call + our result to conversation
      const modelParts: Part[] = [
        {
          functionCall: {
            name: functionCall.name!,
            args: functionCall.args ?? {},
            id: functionCall.id,
          },
        },
      ];
      contents.push({ role: "model", parts: modelParts });

      const userParts: Part[] = [
        {
          functionResponse: {
            name: functionCall.name!,
            response: { result: toolResult },
            id: functionCall.id,
          },
        },
      ];
      contents.push({ role: "user", parts: userParts });

      continue;
    }

    // Gemini returned text
    const reply =
      response.text ??
      "Sorry, I could not process your message. Please try again.";

    return { reply, orderConfirmed, orderSummary };
  }

  return {
    reply: "Sorry, something went wrong. Please try again.",
    orderConfirmed: false,
    orderSummary: null,
  };
}

/**
 * Format order as a WhatsApp message for the kitchen owner
 */
function formatFoodOrderForSeller(
  orderId: string,
  summary: Record<string, unknown>,
  customerName: string
): string {
  const lines = [
    `CONFIRMED ORDER ${String.fromCodePoint(0x1f35a)}`,
    `Order ID: ${orderId}`,
    ``,
    `Customer: ${customerName}`,
    `Items: ${summary.items}`,
    `Total: ${summary.total}`,
    `${summary.delivery_type === "delivery" ? `Delivery to: ${summary.delivery_address}` : "Pickup"}`,
    `Meal: ${summary.meal_type}`,
  ];

  if (summary.notes) {
    lines.push(`Notes: ${summary.notes}`);
  }

  lines.push(``);
  lines.push(`Please prepare and deliver.`);

  return lines.join("\n");
}
