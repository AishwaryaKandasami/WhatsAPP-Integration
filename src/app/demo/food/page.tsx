"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { FlowMessage } from "@/lib/flow/food-flow";

// One-tap starters so a prospect reaches the "wow" moment instantly.
const STARTERS = [
  "Vanakkam 🙏",
  "inniki enna iruku?",
  "lunch menu please",
  "2 idli parcel venum",
];

// WhatsApp palette (matches the landing-page mockup).
const WA_GREEN = "#075E54";
const WA_GREEN_DARK = "#054d44";
const WA_CHAT_BG = "#ECE5DD";
const WA_OUTGOING = "#DCF8C6";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  // Structured payload for assistant turns (text + buttons + lists).
  flowMessages?: FlowMessage[];
}

export default function FoodDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Unique session ID per page load — prevents context pollution
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleNewChat() {
    sessionIdRef.current = crypto.randomUUID();
    setMessages([]);
    setInput("");
  }

  // Core send — handles both typed text and button/list taps.
  async function postMessage(
    text: string,
    interaction?: { id: string; type: "button_reply" | "list_reply" }
  ) {
    if (loading || !text.trim()) return;

    setLoading(true);
    const updated: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(updated);

    try {
      const res = await fetch("/api/food-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionIdRef.current,
          interactionId: interaction?.id,
          interactionType: interaction?.type,
        }),
      });

      if (res.status === 429) {
        setMessages([
          ...updated,
          {
            role: "assistant",
            text: "Daily request limit reached. The free tier allows limited requests per day. Please try again tomorrow.",
          },
        ]);
        return;
      }

      const data = await res.json();
      const flowMessages: FlowMessage[] = Array.isArray(data.messages)
        ? data.messages
        : [];

      if (flowMessages.length > 0) {
        setMessages([
          ...updated,
          { role: "assistant", text: data.reply ?? "", flowMessages },
        ]);
      } else if (data.reply) {
        setMessages([
          ...updated,
          {
            role: "assistant",
            text: data.reply,
            flowMessages: [{ type: "text", text: data.reply }],
          },
        ]);
      } else {
        setMessages([
          ...updated,
          {
            role: "assistant",
            text: data.error || "Something went wrong. Please try again.",
          },
        ]);
      }
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", text: "Failed to connect to the server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    postMessage(text);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-green-100 to-emerald-50 sm:p-6">
      {/* Phone frame (device look on desktop, full-screen on mobile) */}
      <div
        className="flex h-screen w-full flex-col overflow-hidden sm:h-[88vh] sm:max-h-[780px] sm:max-w-[400px] sm:rounded-[2.2rem] sm:border-8 sm:border-gray-900 sm:shadow-2xl"
        style={{ backgroundColor: WA_CHAT_BG }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 text-white shadow"
          style={{ backgroundColor: WA_GREEN }}
        >
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to home"
              className="text-green-100 transition-colors hover:text-white"
            >
              ←
            </Link>
            <div>
              <h1 className="text-lg font-semibold">
                {String.fromCodePoint(0x1f35a)} AR Kitchen
              </h1>
              <p className="text-sm text-green-100">
                Order homemade food on WhatsApp. Try English or Tanglish!
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: WA_GREEN_DARK }}
            >
              New Chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="mt-16 text-center text-gray-500">
              <p className="mb-4 text-4xl">{String.fromCodePoint(0x1f44b)}</p>
              <p>Send a message to order food!</p>
              <p className="mt-1 text-sm">Tap one to start:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 px-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => postMessage(s)}
                    disabled={loading}
                    className="rounded-full border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-50 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const interactive = isLast && !loading && msg.role === "assistant";

            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-none px-4 py-2 text-sm text-gray-800 shadow-sm"
                    style={{ backgroundColor: WA_OUTGOING }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            }

            // Assistant turn — render each flow message (text + buttons + lists).
            const parts = msg.flowMessages ?? [
              { type: "text" as const, text: msg.text },
            ];

            return (
              <div key={i} className="flex flex-col items-start gap-2">
                {parts.map((fm, j) => (
                  <div key={j} className="flex w-full flex-col items-start gap-2">
                    {fm.text && (
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-lg rounded-bl-none bg-white px-4 py-2 text-sm text-gray-800 shadow">
                        {fm.text}
                      </div>
                    )}

                    {/* Reply buttons */}
                    {fm.type === "buttons" && fm.buttons && (
                      <div className="flex w-full max-w-[80%] flex-col gap-2">
                        {fm.buttons.map((b) => (
                          <button
                            key={b.id}
                            disabled={!interactive}
                            onClick={() =>
                              postMessage(b.title, {
                                id: b.id,
                                type: "button_reply",
                              })
                            }
                            className={`w-full rounded-full border px-4 py-2 text-center text-sm font-medium transition-colors ${
                              interactive
                                ? "cursor-pointer border-[#075E54] bg-white text-[#075E54] hover:bg-green-50"
                                : "cursor-default border-gray-200 bg-gray-50 text-gray-400"
                            }`}
                          >
                            {b.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* List rows */}
                    {fm.type === "list" && fm.listSections && (
                      <div className="flex w-full max-w-[85%] flex-col gap-2">
                        {fm.listSections.map((section, si) => (
                          <div key={si} className="flex flex-col gap-2">
                            {section.title && (
                              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {section.title}
                              </p>
                            )}
                            {section.rows.map((row) => (
                              <button
                                key={row.id}
                                disabled={!interactive}
                                onClick={() =>
                                  postMessage(row.title, {
                                    id: row.id,
                                    type: "list_reply",
                                  })
                                }
                                className={`w-full rounded-lg border px-4 py-2.5 text-left transition-colors ${
                                  interactive
                                    ? "cursor-pointer border-gray-200 bg-white hover:border-green-500 hover:bg-green-50"
                                    : "cursor-default border-gray-200 bg-gray-50"
                                }`}
                              >
                                <span
                                  className={`block text-sm font-medium ${
                                    interactive ? "text-gray-800" : "text-gray-400"
                                  }`}
                                >
                                  {row.title}
                                </span>
                                {row.description && (
                                  <span
                                    className={`mt-0.5 block text-xs ${
                                      interactive
                                        ? "text-gray-500"
                                        : "text-gray-300"
                                    }`}
                                  >
                                    {row.description}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-400 shadow">
                Typing...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t bg-white p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Order food... (English or Tanglish)"
              className="flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#075E54]"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full px-6 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: WA_GREEN }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
