// Shared Groq (OpenAI-compatible) chat client used by every bot's AI fallback
// layer. Plain fetch, no SDK. Never throws: a missing key or an API error returns
// { reply: null, usedAI: false } so each caller can fall back to its own canned
// message and the bot never breaks.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResult {
  /** AI text, or null when AI was unavailable/failed (caller supplies fallback). */
  reply: string | null;
  usedAI: boolean;
}

/** Enforce Roman/Tanglish only — strip Tamil-script characters if any slip in. */
export function sanitize(text: string): string {
  return text.replace(/[஀-௿]/g, "").trim();
}

/**
 * Call Groq with a system prompt, the user's message, and optional recent
 * history (last 6 turns are sent). Output is sanitized to Roman script.
 */
export async function callGroq(
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[Groq] GROQ_API_KEY not set — caller will use its fallback.");
    return { reply: null, usedAI: false };
  }

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).slice(-6),
      { role: "user", content: userMessage },
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
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 250,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Groq] API error ${res.status}: ${errText.slice(0, 300)}`);
      return { reply: null, usedAI: false };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json?.choices?.[0]?.message?.content?.trim();
    if (!raw) return { reply: null, usedAI: false };

    const clean = sanitize(raw);
    return clean
      ? { reply: clean, usedAI: true }
      : { reply: null, usedAI: false };
  } catch (err) {
    console.error("[Groq] call failed:", err);
    return { reply: null, usedAI: false };
  }
}
