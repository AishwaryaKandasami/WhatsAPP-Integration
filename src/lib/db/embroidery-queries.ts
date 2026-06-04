import { supabase } from "./client";

// Embroidery orders live in the existing `orders` table (migration 001).
// status CHECK: pending | confirmed | in_progress | done | cancelled.

export interface EmbroideryOrderRow {
  id: string;
  conversation_id: string | null;
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

/**
 * Save a confirmed embroidery order (mirrors saveFoodOrder for the food bot).
 * The customer has confirmed, so status starts at "confirmed"; the maker then
 * advances it confirmed -> in_progress -> done from the dashboard.
 */
export async function saveEmbroideryOrder(order: {
  conversation_id?: string;
  customer_phone: string;
  customer_name?: string;
  design: string;
  fabric?: string | null;
  placement?: string | null;
  thread_color?: string | null;
  deadline?: string | null;
  location?: string | null;
  price?: number | null;
  notes?: string | null;
}): Promise<EmbroideryOrderRow> {
  const db = supabase();

  const { data, error } = await db
    .from("orders")
    .insert({
      conversation_id: order.conversation_id ?? null,
      customer_phone: order.customer_phone,
      customer_name: order.customer_name ?? null,
      design: order.design,
      fabric: order.fabric ?? null,
      placement: order.placement ?? null,
      thread_color: order.thread_color ?? null,
      deadline: order.deadline ?? null,
      location: order.location ?? null,
      price: order.price ?? null,
      notes: order.notes ?? null,
      status: "confirmed",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("Failed to save embroidery order:", error);
    throw error ?? new Error("Failed to save embroidery order");
  }

  return data as EmbroideryOrderRow;
}

/**
 * Recent embroidery orders (most recent first) for the owner dashboard.
 */
export async function getEmbroideryOrders(
  limit = 100
): Promise<EmbroideryOrderRow[]> {
  const db = supabase();

  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch embroidery orders:", error);
    return [];
  }

  return (data ?? []) as EmbroideryOrderRow[];
}

/**
 * Update a single embroidery order's status.
 * Allowed (DB CHECK): pending | confirmed | in_progress | done | cancelled.
 */
export async function updateEmbroideryOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  const db = supabase();

  const { error } = await db
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    console.error("Failed to update embroidery order status:", error);
    throw error;
  }
}
