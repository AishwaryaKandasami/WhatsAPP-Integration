"use client";

import { useState, useRef, useEffect } from "react";
import type { FlowMessage } from "@/lib/flow/food-flow";

// Prospect-facing CTA — opens a WhatsApp chat with the agency number,
// not the configured seller's number. Update WHATSAPP_CTA_NUMBER if it changes.
const WHATSAPP_CTA_NUMBER = "919442708293";
const WHATSAPP_CTA_MESSAGE =
  "Hi, I'd like to get this WhatsApp bot for my business";
const WHATSAPP_CTA_URL = `https://wa.me/${WHATSAPP_CTA_NUMBER}?text=${encodeURIComponent(
  WHATSAPP_CTA_MESSAGE
)}`;

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
    const updated: ChatMessage[] = [
      ...messages,
      { role: "user", text },
    ];
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
    <div className="flex flex-col h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {String.fromCodePoint(0x1f35a)} Amma&apos;s Kitchen
          </h1>
          <p className="text-orange-100 text-sm">
            Order homemade food on WhatsApp. Try English or Tanglish!
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            className="bg-orange-700 hover:bg-orange-800 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
          >
            New Chat
          </button>
        )}
      </div>

      {/* Prospect CTA */}
      <a
        href={WHATSAPP_CTA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-orange-100 hover:bg-orange-200 text-orange-800 text-center text-sm font-medium py-2 px-4 transition-colors"
      >
        Want this for your business? Chat with us on WhatsApp →
      </a>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-4xl mb-4">{String.fromCodePoint(0x1f44b)}</p>
            <p>Send a message to order food!</p>
            <p className="text-sm mt-2">
              Try: &quot;hi&quot;, &quot;inniki enna iruku?&quot;, or
              &quot;lunch menu please&quot;
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const interactive = isLast && !loading && msg.role === "assistant";

          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap text-sm bg-orange-500 text-white rounded-br-none">
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
                <div key={j} className="flex flex-col items-start gap-2 w-full">
                  {fm.text && (
                    <div className="max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap text-sm bg-white text-gray-800 rounded-bl-none shadow">
                      {fm.text}
                    </div>
                  )}

                  {/* Reply buttons */}
                  {fm.type === "buttons" && fm.buttons && (
                    <div className="flex flex-col gap-2 w-full max-w-[80%]">
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
                          className={`w-full text-center text-sm font-medium px-4 py-2 rounded-full border transition-colors ${
                            interactive
                              ? "bg-white border-orange-500 text-orange-600 hover:bg-orange-50 cursor-pointer"
                              : "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                          }`}
                        >
                          {b.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* List rows */}
                  {fm.type === "list" && fm.listSections && (
                    <div className="flex flex-col gap-2 w-full max-w-[85%]">
                      {fm.listSections.map((section, si) => (
                        <div key={si} className="flex flex-col gap-2">
                          {section.title && (
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
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
                              className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors ${
                                interactive
                                  ? "bg-white border-gray-200 hover:border-orange-400 hover:bg-orange-50 cursor-pointer"
                                  : "bg-gray-50 border-gray-200 cursor-default"
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
                                  className={`block text-xs mt-0.5 ${
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
            <div className="bg-white rounded-lg px-4 py-2 shadow text-gray-400 text-sm">
              Typing...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t">
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
            className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-orange-600 text-white rounded-full px-6 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
