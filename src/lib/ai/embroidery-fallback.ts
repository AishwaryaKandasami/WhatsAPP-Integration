import { catalogForPrompt } from "@/lib/catalog";
import { callGroq } from "./groq-client";

/**
 * Layer 3 of the embroidery hybrid bot: AI fallback.
 *
 * Fires only when the flow (Layer 2) and FAQ (Layer 1) can't handle a plain-text
 * message — e.g. a messy Tanglish design request that didn't match the catalog.
 * The system prompt is grounded in the real design catalog so the AI can't invent
 * designs or prices. Uses the shared ./groq-client. Never throws.
 */

export interface EmbroideryFallbackResult {
  reply: string;
  usedAI: boolean;
}

const BUSINESS_NAME = process.env.SELLER_BUSINESS_NAME || "our embroidery studio";

/** Safe canned reply when AI is unavailable (no key / API error). */
function deterministicFallback(): string {
  return "Sorry, I didn't quite catch that. Type the design name you'd like (or 'designs' to see the full list) and I'll start your order.";
}

function buildSystemPrompt(): string {
  let catalog = "";
  try {
    catalog = catalogForPrompt();
  } catch {
    catalog = "";
  }

  return [
    `You are the order assistant for ${BUSINESS_NAME}, an embroidery & tailoring business, on WhatsApp.`,
    `Reply ONLY in Roman/English letters. Tanglish is welcome (Tamil words written in English letters), but NEVER use Tamil script or any non-Latin script.`,
    `Keep replies SHORT (1-2 sentences), warm and friendly.`,
    `Your ONLY job: help the customer choose a DESIGN from the list below. If they ask for something not listed, suggest the closest design(s) that ARE listed, or mention Custom Design.`,
    `Do NOT invent designs or prices. Do NOT confirm or finalise orders — the system does that. After helping them choose, tell them to type the design name to start.`,
    catalog ? `\nDESIGNS:\n${catalog}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Get an AI fallback reply. Never throws — always returns a usable string.
 */
export async function embroideryFallbackReply(
  customerMessage: string,
  opts?: {
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }
): Promise<EmbroideryFallbackResult> {
  if (!process.env.GROQ_API_KEY) {
    return { reply: deterministicFallback(), usedAI: false };
  }

  const systemPrompt = buildSystemPrompt();
  const { reply, usedAI } = await callGroq(
    systemPrompt,
    customerMessage,
    opts?.history
  );
  return { reply: reply ?? deterministicFallback(), usedAI };
}
