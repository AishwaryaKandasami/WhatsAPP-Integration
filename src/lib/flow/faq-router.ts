import { getFoodBusinessConfig } from "@/lib/db/food-queries";

/**
 * Layer 1 of the hybrid bot: deterministic FAQ answers.
 *
 * Some questions are asked constantly ("do you deliver to X?", "delivery
 * charge enna?"). These don't need AI — the answer is a fixed template built
 * from the business config. This saves AI quota and gives instant, always-correct
 * replies.
 *
 * Scope (chosen by owner): "Delivery areas & charges" only.
 * The matcher list below is structured so more FAQs (timings, payment, etc.)
 * can be added later without touching the call site.
 */

export interface FaqMatch {
  matched: boolean;
  answer?: string;
}

/**
 * Decide whether a free-text message is a "delivery areas & charges" question.
 *
 * Gate 1: the message must mention delivery at all ("deliver"/"delivery").
 *         Real addresses almost never contain that word, so this avoids
 *         hijacking the address-input step of the order flow.
 * Gate 2: it must also carry a question signal — about AREAS or CHARGES,
 *         or end in a question mark / start with a question word.
 */
function isDeliveryQuestion(text: string): boolean {
  const t = text.toLowerCase();

  const mentionsDelivery = /\bdeliver(y|ies)?\b|\bdelivary\b/.test(t);
  if (!mentionsDelivery) return false;

  const askingArea =
    /which area|what area|\barea\b|areas|do you deliver|do u deliver|deliver to which|where (do|all) you|cover|serviceab|pincode|pin code/.test(
      t
    );

  const askingCharge =
    /charge|cost|\bfee\b|\bfree\b|how much|rate|evlo|evvalavu|kaasu|price for deliver/.test(
      t
    );

  const looksLikeQuestion =
    t.includes("?") || /^(do|does|can|could|which|what|how|where|is|are)\b/.test(t.trim());

  return askingArea || askingCharge || looksLikeQuestion;
}

/**
 * Build the standard delivery-areas-and-charges answer from business config.
 */
function buildDeliveryAnswer(config: {
  delivery_areas?: string[] | null;
  delivery_charge?: number | null;
  delivery_note?: string | null;
  minimum_order?: number | null;
}): string {
  const lines: string[] = [];

  const areas = (config.delivery_areas ?? []).filter(Boolean);
  if (areas.length > 0) {
    lines.push(`We deliver to: ${areas.join(", ")}.`);
  } else {
    lines.push("Tell us your area and we'll check if we can deliver there.");
  }

  if (config.delivery_charge && config.delivery_charge > 0) {
    lines.push(`Delivery charge: Rs.${config.delivery_charge}.`);
  } else {
    lines.push("Delivery is FREE in our areas!");
  }

  if (config.delivery_note) {
    lines.push(config.delivery_note);
  }

  if (config.minimum_order && config.minimum_order > 0) {
    lines.push(`Minimum order: Rs.${config.minimum_order}.`);
  }

  return lines.join("\n");
}

/**
 * Check a free-text message against the FAQ layer.
 * Returns { matched: false } if no FAQ applies (caller falls through to the flow).
 *
 * IMPORTANT: callers should only run this for plain text messages, never for
 * button/list interactions (those are deterministic flow inputs).
 */
export async function checkFaq(text: string | null | undefined): Promise<FaqMatch> {
  if (!text || !text.trim()) return { matched: false };

  if (isDeliveryQuestion(text)) {
    try {
      const config = await getFoodBusinessConfig();
      return { matched: true, answer: buildDeliveryAnswer(config) };
    } catch (err) {
      console.error("[FAQ] Failed to load business config:", err);
      // Config unavailable — let the flow / AI handle it instead.
      return { matched: false };
    }
  }

  return { matched: false };
}
