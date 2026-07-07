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
 * Get or create a conversation for a customer phone number.
 * Sessions auto-expire after sessionTimeoutMinutes (default 30).
 */
export async function getOrCreateConversation(
  customerPhone: string,
  customerName?: string,
  sessionTimeoutMinutes: number = 30
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
    // Check session timeout
    const updatedAt = new Date(existingRow.updated_at).getTime();
    const now = Date.now();
    const minutesSinceUpdate = (now - updatedAt) / (1000 * 60);

    if (minutesSinceUpdate > sessionTimeoutMinutes) {
      // Session expired — close old conversation
      console.log(`[Session] Conversation ${existingRow.id} expired (${Math.round(minutesSinceUpdate)}min idle). Creating new.`);
      await db
        .from("conversations")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);
      // Fall through to create new conversation
    } else {
      // Session still active — update timestamp and return
      const updates: Record<string, string> = { updated_at: new Date().toISOString() };
      if (customerName && customerName !== existingRow.customer_name) {
        updates.customer_name = customerName;
      }
      await db.from("conversations").update(updates).eq("id", existingRow.id);
      return existingRow;
    }
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

/**
 * Get the flow state and data for a conversation.
 */
export async function getFlowState(
  conversationId: string
): Promise<{ flow_state: string; flow_data: Record<string, unknown> }> {
  const db = supabase();

  const { data, error } = await db
    .from("conversations")
    .select("flow_state, flow_data")
    .eq("id", conversationId)
    .single();

  if (error || !data) {
    return { flow_state: "start", flow_data: {} };
  }

  return {
    flow_state: (data as { flow_state: string | null; flow_data: unknown }).flow_state ?? "start",
    flow_data: ((data as { flow_state: string | null; flow_data: unknown }).flow_data ?? {}) as Record<string, unknown>,
  };
}

/**
 * Update the flow state and data for a conversation.
 */
export async function updateFlowState(
  conversationId: string,
  flowState: string,
  flowData: Record<string, unknown>
): Promise<void> {
  const db = supabase();

  const { error } = await db
    .from("conversations")
    .update({
      flow_state: flowState,
      flow_data: flowData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) {
    console.error("Failed to update flow state:", error);
  }
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
 * Idempotency guard: has this Meta message id already been stored?
 * Meta retries webhook deliveries, so without this a retry can double-process
 * an order. Fails open (returns false) on error — dropping a message is worse
 * than a rare duplicate.
 */
export async function messageExists(metaMessageId: string): Promise<boolean> {
  const db = supabase();

  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("meta_message_id", metaMessageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to check message existence:", error);
    return false;
  }

  return !!data;
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
