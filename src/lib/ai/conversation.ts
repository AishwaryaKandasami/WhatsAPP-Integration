import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { buildSystemPrompt } from "./prompts";
import { functionDeclarations, executeTool } from "./tools";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIResponse {
  reply: string;
  orderCreated: boolean;
  orderSummary: string | null;
}

/**
 * Process a customer message through Gemini and return a reply.
 * Handles multi-turn tool use (Gemini may call tools, then generate a final text response).
 */
export async function processMessage(
  customerMessage: string,
  conversationHistory: ConversationMessage[],
  customerName: string
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt();

  // Build message history for Gemini
  // Gemini uses "user" and "model" roles (not "assistant")
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

  let orderCreated = false;
  let orderSummary: string | null = null;

  const config = {
    tools: [{ functionDeclarations }],
  };

  // Gemini may need multiple rounds if it calls tools
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Retry up to 2 times on temporary errors (503 high demand, 429 rate limit)
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
        break; // Success — exit retry loop
      } catch (err: unknown) {
        const apiErr = err as { status?: number };
        if ((apiErr.status === 503 || apiErr.status === 429) && retry < 2) {
          console.log(`Gemini ${apiErr.status} error, retrying in ${(retry + 1) * 2}s...`);
          await new Promise((r) => setTimeout(r, (retry + 1) * 2000));
          continue;
        }
        throw err; // Non-retryable error or max retries reached
      }
    }
    if (!response) throw new Error("Gemini call failed after retries");

    // Check if Gemini wants to call functions
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionCall = response.functionCalls[0];
      console.log(`Tool call: ${functionCall.name}`, JSON.stringify(functionCall.args));

      // Execute the tool
      const toolResult = executeTool(
        functionCall.name!,
        (functionCall.args ?? {}) as Record<string, unknown>
      );

      // Track order creation
      if (functionCall.name === "create_order") {
        const result = toolResult as {
          success?: boolean;
          order_id?: string;
          summary?: Record<string, unknown>;
        };
        if (result.success) {
          orderCreated = true;
          orderSummary = formatOrderForSeller(
            result.order_id as string,
            result.summary as Record<string, unknown>,
            customerName
          );
        }
      }

      // Add model's function call turn to conversation
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

      // Add our function result
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

      continue; // Let Gemini generate a final response using the tool result
    }

    // Gemini returned text — we're done
    const reply =
      response.text ??
      "Sorry, I could not process your message. Please try again.";

    return { reply, orderCreated, orderSummary };
  }

  // Safety fallback
  return {
    reply: "Sorry, something went wrong. Please try again.",
    orderCreated: false,
    orderSummary: null,
  };
}

/**
 * Format order details as a WhatsApp message for the seller
 */
function formatOrderForSeller(
  orderId: string,
  summary: Record<string, unknown>,
  customerName: string
): string {
  const lines = [
    `NEW ORDER ${String.fromCodePoint(0x1f9f5)}`,
    `Order ID: ${orderId}`,
    ``,
    `Customer: ${customerName}`,
    `Design: ${summary.design}`,
    `Fabric: ${summary.fabric}`,
    `Placement: ${summary.placement}`,
    `Thread: ${summary.thread_color}`,
    `Deadline: ${summary.deadline}`,
    `Location: ${summary.location}`,
    `Est. Price: ${summary.estimated_price}`,
  ];

  if (summary.notes) {
    lines.push(`Notes: ${summary.notes}`);
  }

  lines.push(``);
  lines.push(`Reply DONE when completed.`);

  return lines.join("\n");
}
