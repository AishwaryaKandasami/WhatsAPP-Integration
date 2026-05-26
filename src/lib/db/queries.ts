import { supabase } from "./client";
import type { ConversationMessage } from "../ai/conversation";

// ─── Types (manual until we generate from Supabase) ──────────────

interface ConversationRow {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  language: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: string;
  content: string;
  message_type: string;
  meta_message_id: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  design: string;
  fabric: string | null;
  placement: string | null;
  thread_color: string | null;
  deadline: string | null;
  location: string | null;
  price: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

// ─── Conversations ───────────────────────────────────────────────

/**
 * Get or create a conversation for a customer phone number
 */
export async function getOrCreateConversation(
  customerPhone: string,
  customerName?: string
): Promise<ConversationRow> {
  const db = supabase();

  // Try to find existing active conversation
  const { data: existing } = await db
    .from("conversations")
    .select("*")
    .eq("customer_phone", customerPhone)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const existingRow = existing as ConversationRow | null;

  if (existingRow) {
    // Update last activity + name if we have a better one
    if (customerName && customerName !== existingRow.customer_name) {
      await db
        .from("conversations")
        .update({ customer_name: customerName, updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);
    } else {
      await db
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);
    }
    return existingRow;
  }

  // Create new conversation
  const { data: created, error } = await db
    .from("conversations")
    .insert({
      customer_phone: customerPhone,
      customer_name: customerName ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error || !created) {
    console.error("Failed to create conversation:", error);
    throw error ?? new Error("Failed to create conversation");
  }

  return created as ConversationRow;
}

// ─── Messages ────────────────────────────────────────────────────

/**
 * Store a message (inbound or outbound)
 */
export async function storeMessage(
  conversationId: string,
  direction: "inbound" | "outbound",
  content: string,
  messageType: string = "text",
  metaMessageId?: string
): Promise<void> {
  const db = supabase();

  const { error } = await db.from("messages").insert({
    conversation_id: conversationId,
    direction,
    content,
    message_type: messageType,
    meta_message_id: metaMessageId ?? null,
  });

  if (error) {
    console.error("Failed to store message:", error);
  }
}

/**
 * Get recent messages for a conversation (for AI context)
 */
export async function getConversationHistory(
  conversationId: string,
  limit: number = 10
): Promise<ConversationMessage[]> {
  const db = supabase();

  const { data, error } = await db
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to get conversation history:", error);
    return [];
  }

  const rows = (data ?? []) as Pick<MessageRow, "direction" | "content">[];

  return rows.map((msg) => ({
    role: msg.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));
}

// ─── Orders ──────────────────────────────────────────────────────

/**
 * Store a new order
 */
export async function createOrder(order: {
  conversation_id: string;
  customer_phone: string;
  customer_name?: string;
  design: string;
  fabric: string;
  placement: string;
  thread_color: string;
  deadline: string;
  location: string;
  price?: number;
  notes?: string;
}): Promise<OrderRow> {
  const db = supabase();

  const { data, error } = await db
    .from("orders")
    .insert({
      conversation_id: order.conversation_id,
      customer_phone: order.customer_phone,
      customer_name: order.customer_name ?? null,
      design: order.design,
      fabric: order.fabric,
      placement: order.placement,
      thread_color: order.thread_color,
      deadline: order.deadline,
      location: order.location,
      price: order.price ?? null,
      notes: order.notes ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("Failed to create order:", error);
    throw error ?? new Error("Failed to create order");
  }

  return data as OrderRow;
}
