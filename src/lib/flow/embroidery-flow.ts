import { getAllDesigns, getDesignById } from "@/lib/catalog";
import type { CatalogItem } from "@/lib/catalog";
import { saveEmbroideryOrder } from "@/lib/db/embroidery-queries";
import { checkEmbroideryFaq } from "./embroidery-faq";
import type { FlowMessage, MessageInput } from "./types";

/**
 * Embroidery order flow - the hybrid state machine (mirrors food-flow.ts).
 *
 * Streamlined intake: design -> garment -> deadline -> area -> (optional note)
 * -> confirm. One design per order (no multi-item cart). Buttons/lists drive the
 * happy path with zero AI; free text is parsed where possible, and only truly
 * unparseable text sets needsAI for the Groq fallback.
 */

// ─── Types ──────────────────────────────────────────────────────

export type EmbroideryFlowState =
  | "start"
  | "design_pick"
  | "custom_desc"
  | "garment_pick"
  | "deadline_pick"
  | "area_input"
  | "note_input"
  | "order_summary"
  | "confirmed";

export interface EmbroideryFlowData {
  design_id: string | null;
  design_name: string | null;
  price: number | null;
  turnaround_days: number | null;
  custom: boolean;
  custom_desc: string | null;
  fabric: string | null;
  deadline: string | null;
  location: string | null;
  notes: string | null;
}

export interface EmbroideryFlowResult {
  newState: EmbroideryFlowState;
  newData: EmbroideryFlowData;
  messages: FlowMessage[];
  needsAI?: boolean;
  orderConfirmed?: boolean;
  orderSummary?: string;
}

const BUSINESS_NAME =
  process.env.SELLER_BUSINESS_NAME || "our embroidery studio";

// ─── Helpers ────────────────────────────────────────────────────

function emptyEmbroideryFlowData(): EmbroideryFlowData {
  return {
    design_id: null,
    design_name: null,
    price: null,
    turnaround_days: null,
    custom: false,
    custom_desc: null,
    fabric: null,
    deadline: null,
    location: null,
    notes: null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Distinctive keywords per design (avoids matching generic words like "design").
const DESIGN_KEYWORDS: Record<string, string[]> = {
  "floral-motif": ["floral", "flower", "poo"],
  "peacock-design": ["peacock", "mayil"],
  "temple-border": ["temple", "kovil"],
  "mughal-pattern": ["mughal", "mugal"],
  "mango-paisley": ["mango", "paisley", "maavilai", "mavilai", "manga"],
  "custom-design": ["custom", "reference", "own design", "my design"],
};

function matchDesignFromText(text: string): CatalogItem | null {
  const t = text.toLowerCase();
  for (const d of getAllDesigns()) {
    const kws = DESIGN_KEYWORDS[d.id] ?? [];
    if (kws.some((k) => t.includes(k))) return d;
  }
  for (const d of getAllDesigns()) {
    if (t.includes(d.name.toLowerCase())) return d;
  }
  return null;
}

function priceLabel(design: { price: number; note?: string }): string {
  return design.price > 0
    ? `Rs.${design.price}`
    : design.note ?? "Custom price";
}

// ─── Flow Engine ────────────────────────────────────────────────

export async function handleEmbroideryFlowStep(
  state: EmbroideryFlowState,
  data: EmbroideryFlowData,
  input: MessageInput,
  context: { customerPhone?: string; conversationId?: string; customerName?: string }
): Promise<EmbroideryFlowResult> {
  // ── Layer 1: FAQ (plain text only; never changes state) ──
  if (input.type === "text" && input.text) {
    const faq = await checkEmbroideryFaq(input.text);
    if (faq.matched && faq.answer) {
      return {
        newState: state,
        newData: data,
        messages: [{ type: "text", text: faq.answer }],
      };
    }
  }

  switch (state) {
    case "start":
      return handleStart(input);
    case "design_pick":
      return handleDesignPick(data, input);
    case "custom_desc":
      return handleCustomDesc(data, input);
    case "garment_pick":
      return handleGarmentPick(data, input);
    case "deadline_pick":
      return handleDeadlinePick(data, input);
    case "area_input":
      return handleAreaInput(data, input);
    case "note_input":
      return handleNoteInput(data, input);
    case "order_summary":
      return handleOrderSummary(data, input, context);
    case "confirmed":
      return handleStart(input);
    default:
      return handleStart(input);
  }
}

// ─── State Handlers ─────────────────────────────────────────────

async function handleStart(input: MessageInput): Promise<EmbroideryFlowResult> {
  // Jump-ahead: if they named a design (or a list tap carried over), skip in.
  let design: CatalogItem | null = null;
  if (input.type === "list_reply" && input.interactionId?.startsWith("design_")) {
    design = getDesignById(input.interactionId.replace("design_", "")) ?? null;
  }
  if (!design && input.type === "text" && input.text) {
    design = matchDesignFromText(input.text);
  }
  if (design) return showDesignChosen(design, emptyEmbroideryFlowData());
  return showDesignList(true);
}

function showDesignList(withGreeting: boolean): EmbroideryFlowResult {
  const designs = getAllDesigns();
  const rows = designs.map((d) => ({
    id: `design_${d.id}`,
    title: d.name.slice(0, 24),
    description: `${priceLabel(d)} - ${d.turnaround_days} days`.slice(0, 72),
  }));

  const messages: FlowMessage[] = [];
  if (withGreeting) {
    messages.push({
      type: "text",
      text: `Vanakkam! Welcome to ${BUSINESS_NAME}. Here are our embroidery designs.`,
    });
  }
  messages.push({
    type: "list",
    text: "Tap a design to start your order. (Or just type the design name.)",
    listButtonText: "View Designs",
    listSections: [{ title: "Designs", rows }],
  });

  return {
    newState: "design_pick",
    newData: emptyEmbroideryFlowData(),
    messages,
  };
}

async function handleDesignPick(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  let design: CatalogItem | null = null;
  if (input.type === "list_reply" && input.interactionId?.startsWith("design_")) {
    design = getDesignById(input.interactionId.replace("design_", "")) ?? null;
  }
  if (!design && input.text) {
    design = matchDesignFromText(input.text);
  }

  if (!design) {
    return {
      newState: "design_pick",
      newData: data,
      messages: [
        {
          type: "text",
          text: "I couldn't find that design. Tap one from the list, or type the name (e.g. Peacock).",
        },
      ],
      needsAI: true,
    };
  }

  return showDesignChosen(design, data);
}

function showDesignChosen(
  design: CatalogItem,
  data: EmbroideryFlowData
): EmbroideryFlowResult {
  const newData: EmbroideryFlowData = {
    ...data,
    design_id: design.id,
    design_name: design.name,
    price: design.price > 0 ? design.price : null,
    turnaround_days: design.turnaround_days,
    custom: design.id === "custom-design",
  };

  if (newData.custom) {
    return {
      newState: "custom_desc",
      newData,
      messages: [
        {
          type: "text",
          text: `${design.name} - good choice! Please describe what you'd like (you can also send a reference photo here on WhatsApp). ${
            design.note ?? ""
          }`.trim(),
        },
      ],
    };
  }

  const prefix = `${design.name} - ${priceLabel(design)}, ready in about ${design.turnaround_days} days.`;
  return showGarmentQuestion(newData, prefix);
}

async function handleCustomDesc(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  const desc = input.text?.trim();
  if (!desc || desc.length < 3) {
    return {
      newState: "custom_desc",
      newData: data,
      messages: [
        {
          type: "text",
          text: "Please describe the design you'd like - a few words is fine (e.g. 'peacock on the pallu, gold thread').",
        },
      ],
    };
  }
  return showGarmentQuestion({ ...data, custom_desc: desc });
}

function showGarmentQuestion(
  data: EmbroideryFlowData,
  prefixText?: string
): EmbroideryFlowResult {
  const design = data.design_id ? getDesignById(data.design_id) : undefined;
  let garments = (design?.suitable_for ?? []).filter((g) => g !== "any");
  if (garments.length === 0) {
    garments = ["saree", "blouse", "kurta", "lehenga", "dupatta"];
  }

  const rows = garments.map((g) => ({
    id: `fabric_${g}`,
    title: capitalize(g).slice(0, 24),
    description: `Embroider on a ${g}`.slice(0, 72),
  }));

  const messages: FlowMessage[] = [];
  if (prefixText) messages.push({ type: "text", text: prefixText });
  messages.push({
    type: "list",
    text: "Which garment is it for? Tap one, or type another (e.g. kurta).",
    listButtonText: "Choose Garment",
    listSections: [{ title: "Garment", rows }],
  });

  return { newState: "garment_pick", newData: data, messages };
}

async function handleGarmentPick(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  let garment: string | null = null;
  if (input.type === "list_reply" && input.interactionId?.startsWith("fabric_")) {
    garment = input.interactionId.replace("fabric_", "");
  }
  if (!garment && input.text) {
    const t = input.text.trim();
    if (t.length >= 2 && t.length <= 40) garment = t.toLowerCase();
  }

  if (!garment) {
    return {
      newState: "garment_pick",
      newData: data,
      messages: [
        {
          type: "text",
          text: "Which garment is it for? (e.g. saree, blouse, kurta)",
        },
      ],
    };
  }

  return showDeadlineQuestion({ ...data, fabric: garment });
}

function showDeadlineQuestion(data: EmbroideryFlowData): EmbroideryFlowResult {
  return {
    newState: "deadline_pick",
    newData: data,
    messages: [
      {
        type: "buttons",
        text: "When do you need it by?",
        buttons: [
          { id: "deadline_1week", title: "Within 1 week" },
          { id: "deadline_2weeks", title: "Within 2 weeks" },
          { id: "deadline_norush", title: "No rush" },
        ],
      },
    ],
  };
}

async function handleDeadlinePick(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  let deadline: string | null = null;
  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "deadline_1week") deadline = "Within 1 week";
    else if (input.interactionId === "deadline_2weeks") deadline = "Within 2 weeks";
    else if (input.interactionId === "deadline_norush") deadline = "No rush";
  }
  if (!deadline && input.text) {
    const t = input.text.trim();
    if (t.length >= 2 && t.length <= 40) deadline = t;
  }

  if (!deadline) return showDeadlineQuestion(data);

  return {
    newState: "area_input",
    newData: { ...data, deadline },
    messages: [
      {
        type: "text",
        text: "Which area are you in? (so we can arrange delivery or pickup)",
      },
    ],
  };
}

async function handleAreaInput(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  const area = input.text?.trim();
  if (!area || area.length < 2) {
    return {
      newState: "area_input",
      newData: data,
      messages: [
        {
          type: "text",
          text: "Please type your area / locality (e.g. Anna Nagar, Chennai).",
        },
      ],
    };
  }

  return {
    newState: "note_input",
    newData: { ...data, location: area },
    messages: [
      {
        type: "buttons",
        text: "Any specific thread colour or placement? Type it, or tap Skip.",
        buttons: [{ id: "note_skip", title: "Skip" }],
      },
    ],
  };
}

async function handleNoteInput(
  data: EmbroideryFlowData,
  input: MessageInput
): Promise<EmbroideryFlowResult> {
  let notes: string | null = data.notes;
  if (input.type === "button_reply" && input.interactionId === "note_skip") {
    notes = null;
  } else if (input.text) {
    const t = input.text.trim();
    notes = /^(skip|no|none|nothing)$/i.test(t) ? null : t || null;
  }
  return showOrderSummary({ ...data, notes });
}

function showOrderSummary(data: EmbroideryFlowData): EmbroideryFlowResult {
  const priceText = data.custom
    ? "Price: studio will confirm (custom design)"
    : data.price
      ? `Price: Rs.${data.price}`
      : "Price: on request";

  const lines = [
    "Order Summary:",
    "",
    `Design: ${data.design_name}`,
    data.fabric ? `Garment: ${capitalize(data.fabric)}` : null,
    data.deadline ? `Needed: ${data.deadline}` : null,
    data.location ? `Area: ${data.location}` : null,
    data.custom_desc ? `Custom: ${data.custom_desc}` : null,
    data.notes ? `Note: ${data.notes}` : null,
    "",
    priceText,
    data.turnaround_days ? `Turnaround: about ${data.turnaround_days} days` : null,
  ].filter((l): l is string => l !== null);

  return {
    newState: "order_summary",
    newData: data,
    messages: [
      { type: "text", text: lines.join("\n") },
      {
        type: "buttons",
        text: "Shall I send this to the studio?",
        buttons: [
          { id: "confirm_order", title: "Confirm Order" },
          { id: "cancel_order", title: "Cancel" },
        ],
      },
    ],
  };
}

function cancelOrder(): EmbroideryFlowResult {
  return {
    newState: "start",
    newData: emptyEmbroideryFlowData(),
    messages: [
      {
        type: "text",
        text: "No problem - order cancelled. Message anytime to start again!",
      },
    ],
  };
}

async function handleOrderSummary(
  data: EmbroideryFlowData,
  input: MessageInput,
  context: { customerPhone?: string; conversationId?: string; customerName?: string }
): Promise<EmbroideryFlowResult> {
  let confirmed = false;
  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "confirm_order") confirmed = true;
    if (input.interactionId === "cancel_order") return cancelOrder();
  }
  if (!confirmed && input.text) {
    const t = input.text.toLowerCase();
    if (/\b(yes|confirm|ok|okay|seri|sari|send|done)\b/.test(t)) confirmed = true;
    if (/\b(no|cancel|venda|stop)\b/.test(t)) return cancelOrder();
  }

  if (!confirmed) {
    return {
      newState: "order_summary",
      newData: data,
      messages: [
        {
          type: "buttons",
          text: "Please confirm or cancel your order:",
          buttons: [
            { id: "confirm_order", title: "Confirm Order" },
            { id: "cancel_order", title: "Cancel" },
          ],
        },
      ],
    };
  }

  // Combine the custom description + optional note into the order's notes field.
  const combinedNotes =
    [
      data.custom_desc ? `Custom design: ${data.custom_desc}` : null,
      data.notes ? `Note: ${data.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n") || null;

  try {
    await saveEmbroideryOrder({
      conversation_id: context.conversationId,
      customer_phone: context.customerPhone ?? "unknown",
      customer_name: context.customerName ?? "Customer",
      design: data.design_name ?? "Custom Design",
      fabric: data.fabric,
      deadline: data.deadline,
      location: data.location,
      price: data.price,
      notes: combinedNotes,
    });
  } catch (err) {
    console.error("[Embroidery Flow] Failed to save order:", err);
  }

  const priceText = data.custom
    ? "We'll confirm the price shortly."
    : data.price
      ? `Rs.${data.price}.`
      : "";

  const orderSummary = [
    "NEW EMBROIDERY ORDER",
    "",
    `Customer: ${context.customerName ?? "Customer"}`,
    `Design: ${data.design_name}`,
    data.fabric ? `Garment: ${capitalize(data.fabric)}` : "",
    data.deadline ? `Needed: ${data.deadline}` : "",
    data.location ? `Area: ${data.location}` : "",
    combinedNotes ?? "",
    data.custom
      ? "Price: to be confirmed"
      : data.price
        ? `Price: Rs.${data.price}`
        : "Price: on request",
    "",
    "Please review and contact the customer.",
  ]
    .filter(Boolean)
    .join("\n");

  const confirmText = `Order placed! ${data.design_name} for your ${
    data.fabric ?? "garment"
  }. ${priceText} ${
    data.deadline ? `Needed: ${data.deadline}.` : ""
  } The studio will reach out to confirm. Nandri!`
    .replace(/\s+/g, " ")
    .trim();

  return {
    newState: "confirmed",
    newData: emptyEmbroideryFlowData(),
    orderConfirmed: true,
    orderSummary,
    messages: [{ type: "text", text: confirmText }],
  };
}

// ─── Export helpers ──────────────────────────────────────────────

export { emptyEmbroideryFlowData };
