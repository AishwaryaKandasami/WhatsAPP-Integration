import { getAllDesigns } from "@/lib/catalog";

/**
 * Layer 1 of the embroidery hybrid bot: deterministic FAQ answers.
 *
 * Mirrors src/lib/flow/faq-router.ts (food). Some questions are asked constantly
 * — "what designs do you have?", "price list?", "how long does it take?", "where
 * are you?". These don't need AI: the answer is built from the catalog and the
 * business env vars. Saves AI quota and gives instant, always-correct replies.
 *
 * Runs ONLY for plain-text messages (never button/list taps) and NEVER changes
 * flow state — the customer keeps their place in the order.
 */

export interface FaqMatch {
  matched: boolean;
  answer?: string;
}

const LOCATION = process.env.SELLER_LOCATION || "";
const WORKING_HOURS = process.env.SELLER_WORKING_HOURS || "";

function looksLikeQuestion(t: string): boolean {
  return (
    t.includes("?") ||
    /^(do|does|can|could|which|what|how|where|is|are|show|send|tell|list|got|have|you)\b/.test(
      t.trim()
    )
  );
}

/** "what designs do you have", "price list", "how much", "show your designs" */
function isDesignOrPriceQuestion(t: string): boolean {
  const mentionsDesigns =
    /\bdesigns?\b|catalog|catalogue|collection|patterns?/.test(t);
  const mentionsPrice =
    /\bprices?\b|\bcost\b|\brates?\b|how much|evlo|evvalavu|charges?|price list/.test(
      t
    );

  // Generic price question ("price list?", "how much?") — but not "price for X"
  // (a specific item is better handled by the flow / AI).
  if (mentionsPrice && !/\b(for|of)\s+\w/.test(t)) {
    if (mentionsDesigns || /\blist\b/.test(t) || looksLikeQuestion(t)) return true;
  }
  if (mentionsDesigns && (looksLikeQuestion(t) || /\b(list|show|send)\b/.test(t)))
    return true;
  return false;
}

/** "how long does it take", "how many days", "when will it be ready" */
function isTurnaroundQuestion(t: string): boolean {
  const mentions =
    /how long|how many days|\bdays\b|turnaround|when.*(ready|done|get)|time.*(take|make)|ready by/.test(
      t
    );
  return mentions && looksLikeQuestion(t);
}

/** "where are you", "your location", "timings", "working hours" */
function isLocationQuestion(t: string): boolean {
  const mentions =
    /\blocation\b|\baddress\b|\btimings?\b|\bhours?\b|where (are|is|do)|are you open|\bshop\b|\bstore\b/.test(
      t
    );
  return mentions && looksLikeQuestion(t);
}

function buildDesignList(): string {
  const designs = getAllDesigns();
  const lines = designs.map((d) =>
    d.price > 0
      ? `- ${d.name}: Rs.${d.price} (${d.turnaround_days} days)`
      : `- ${d.name}: ${d.note ?? "price on request"} (${d.turnaround_days} days)`
  );
  return `Here are our embroidery designs:\n${lines.join(
    "\n"
  )}\n\nType the design name you'd like and I'll start your order.`;
}

function buildTurnaroundAnswer(): string {
  const designs = getAllDesigns();
  const days = designs.map((d) => d.turnaround_days);
  const min = Math.min(...days);
  const max = Math.max(...days);
  return `Most designs take ${min}-${max} days, depending on the design and detail. Pick a design and I'll tell you its exact time.`;
}

function buildLocationAnswer(): string {
  const lines: string[] = [];
  if (LOCATION) lines.push(`We're in ${LOCATION}.`);
  if (WORKING_HOURS) lines.push(`Working hours: ${WORKING_HOURS}.`);
  if (lines.length === 0) {
    lines.push("Message us anytime and we'll help with your embroidery order.");
  }
  return lines.join("\n");
}

/**
 * Check a free-text message against the FAQ layer.
 * Returns { matched: false } if no FAQ applies (caller falls through to the flow).
 */
export async function checkEmbroideryFaq(
  text: string | null | undefined
): Promise<FaqMatch> {
  if (!text || !text.trim()) return { matched: false };
  const t = text.toLowerCase();

  if (isDesignOrPriceQuestion(t)) {
    return { matched: true, answer: buildDesignList() };
  }
  if (isTurnaroundQuestion(t)) {
    return { matched: true, answer: buildTurnaroundAnswer() };
  }
  if (isLocationQuestion(t)) {
    return { matched: true, answer: buildLocationAnswer() };
  }
  return { matched: false };
}
