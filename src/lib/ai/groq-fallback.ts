import { getTodaysMenu, getFoodBusinessConfig } from "@/lib/db/food-queries";
import { callGroq } from "./groq-client";
import { logEvent } from "@/lib/monitoring";

/**
 * Layer 3 of the food hybrid bot: AI fallback.
 *
 * The flow state machine (Layer 2) handles the button/list happy path with zero
 * AI. The FAQ router (Layer 1) handles delivery questions with a fixed template.
 * This layer only fires when both of those can't help — e.g. the customer typed
 * a menu item in messy Tanglish that didn't match, or asked an unusual question.
 *
 * The actual Groq HTTP call lives in ./groq-client (shared with other bots).
 * Graceful degradation: if AI is unavailable, we return a safe deterministic
 * message and set usedAI:false, so the bot never breaks.
 */

export interface GroqFallbackResult {
  reply: string;
  usedAI: boolean;
}

/** Safe canned reply when AI is unavailable (no key / API error). */
function deterministicFallback(): string {
  return "Sorry, I didn't quite catch that. Please type the item name from the menu, or type 'menu' to see today's options.";
}

async function buildGroqSystemPrompt(mealType: string | null): Promise<string> {
  let menuText = "";
  try {
    const items = await getTodaysMenu(mealType ?? undefined);
    if (items.length > 0) {
      menuText = items
        .map((i) => `- ${i.name} (Rs.${i.price}): ${i.description}`)
        .join("\n");
    }
  } catch {
    menuText = "";
  }

  let businessLine = "";
  try {
    const config = await getFoodBusinessConfig();
    const areas = (config.delivery_areas ?? []).join(", ");
    businessLine = `Business: ${config.business_name}. Delivery areas: ${areas}. Minimum order: Rs.${config.minimum_order}.`;
  } catch {
    businessLine = "";
  }

  return [
    `You are the order assistant for a home kitchen on WhatsApp.`,
    `Reply ONLY in Roman/English letters. Tanglish is welcome (Tamil words written in English letters), but NEVER use Tamil script or any non-Latin script.`,
    `Keep replies SHORT (1-2 sentences), warm and casual — like a friend's mom taking an order.`,
    `Your ONLY job: help the customer pick from TODAY'S MENU below. If they ask for something not on the menu, say it's not available today and suggest the closest items that ARE on the menu.`,
    `Do NOT invent items or prices. Do NOT confirm or finalise orders — the system does that. After helping them choose, tell them to type the exact item name to add it.`,
    businessLine,
    menuText ? `\nTODAY'S MENU:\n${menuText}` : `\n(No menu items are available right now.)`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Get an AI fallback reply. Never throws — always returns a usable string.
 */
export async function groqFallbackReply(
  customerMessage: string,
  opts?: {
    mealType?: string | null;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }
): Promise<GroqFallbackResult> {
  // Short-circuit before any DB work if AI isn't configured.
  if (!process.env.GROQ_API_KEY) {
    return { reply: deterministicFallback(), usedAI: false };
  }

  const systemPrompt = await buildGroqSystemPrompt(opts?.mealType ?? null);
  const { reply, usedAI } = await callGroq(
    systemPrompt,
    customerMessage,
    opts?.history
  );

  // A key is configured but Groq didn't answer — the customer gets the canned
  // reply. Track it so repeated degradation is visible in the logs.
  if (!usedAI) {
    logEvent(
      "ai_fallback_degraded",
      { messagePreview: customerMessage.slice(0, 80) },
      "warn"
    );
  }

  return { reply: reply ?? deterministicFallback(), usedAI };
}
