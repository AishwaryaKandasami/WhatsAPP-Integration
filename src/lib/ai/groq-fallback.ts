import { getTodaysMenu, getFoodBusinessConfig } from "@/lib/db/food-queries";

/**
 * Layer 3 of the hybrid bot: AI fallback.
 *
 * The flow state machine (Layer 2) handles the button/list happy path with zero
 * AI. The FAQ router (Layer 1) handles delivery questions with a fixed template.
 * This layer only fires when both of those can't help — e.g. the customer typed
 * a menu item in messy Tanglish that didn't match, or asked an unusual question.
 *
 * Provider: Groq (free tier ~14,400 req/day, very fast Llama models) via its
 * OpenAI-compatible endpoint. We use plain fetch — no SDK dependency.
 *
 * Graceful degradation: if GROQ_API_KEY is missing or the API errors, we return
 * a safe deterministic message and set usedAI:false, so the bot never breaks.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export interface GroqFallbackResult {
  reply: string;
  usedAI: boolean;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Safe canned reply when AI is unavailable (no key / API error). */
function deterministicFallback(): string {
  return "Sorry, I didn't quite catch that. Please type the item name from the menu, or type 'menu' to see today's options.";
}

/** Enforce Roman/Tanglish only — strip Tamil-script characters if any slip in. */
function sanitize(text: string): string {
  return text.replace(/[஀-௿]/g, "").trim();
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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[Groq] GROQ_API_KEY not set — using deterministic fallback.");
    return { reply: deterministicFallback(), usedAI: false };
  }

  try {
    const systemPrompt = await buildGroqSystemPrompt(opts?.mealType ?? null);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(opts?.history ?? []).slice(-6),
      { role: "user", content: customerMessage },
    ];

    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 250,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Groq] API error ${res.status}: ${errText.slice(0, 300)}`);
      return { reply: deterministicFallback(), usedAI: false };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json?.choices?.[0]?.message?.content?.trim();

    if (!raw) {
      return { reply: deterministicFallback(), usedAI: false };
    }

    return { reply: sanitize(raw) || deterministicFallback(), usedAI: true };
  } catch (err) {
    console.error("[Groq] fallback failed:", err);
    return { reply: deterministicFallback(), usedAI: false };
  }
}
