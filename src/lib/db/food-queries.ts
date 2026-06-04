import { supabase } from "./client";

// ─── IST Timezone Helper ────────────────────────────────────────

/**
 * Get today's date in IST (Asia/Kolkata, UTC+5:30).
 * Returns YYYY-MM-DD string.
 */
export function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// ─── Types ──────────────────────────────────────────────────────

export interface MenuItemRow {
  id: string;
  item_key: string;
  name: string;
  description: string;
  price: number;
  meal_type: string;
  is_active: boolean;
  created_at: string;
}

export interface DailyMenuItemRow {
  id: string;
  item_key: string;
  name: string;
  description: string;
  price: number;
  meal_type: string;
  available: boolean;
}

export interface FoodBusinessConfigRow {
  id: string;
  business_name: string;
  location: string;
  working_hours: string;
  delivery_areas: string[];
  minimum_order: number;
  delivery_charge: number;
  delivery_note: string | null;
  payment_methods: string[];
  serves_breakfast: boolean;
  serves_lunch: boolean;
  serves_dinner: boolean;
}

export interface FoodOrderRow {
  id: string;
  conversation_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  items_json: Array<{ name: string; qty: number; price: number }>;
  items_text: string;
  total: number;
  delivery_type: string;
  delivery_address: string | null;
  meal_type: string;
  notes: string | null;
  status: string;
  created_at: string;
}

// ─── Menu Queries ───────────────────────────────────────────────

/**
 * Get today's available menu items.
 * If no daily_menu rows exist for today, falls back to all active items.
 */
export async function getTodaysMenu(
  mealType?: string
): Promise<DailyMenuItemRow[]> {
  const db = supabase();
  const today = getTodayIST(); // YYYY-MM-DD

  // Check if daily_menu has any rows for today
  const { data: dailyRows, error: dailyError } = await db
    .from("daily_menu")
    .select("menu_item_id, available")
    .eq("date", today);

  if (dailyError) {
    console.error("Failed to fetch daily_menu:", dailyError);
  }

  const hasDailyMenu = dailyRows && dailyRows.length > 0;

  if (hasDailyMenu) {
    // Get available item IDs for today
    const availableIds = (dailyRows as Array<{ menu_item_id: string; available: boolean }>)
      .filter((r) => r.available)
      .map((r) => r.menu_item_id);

    if (availableIds.length === 0) return [];

    // Fetch those menu items
    let query = db
      .from("menu_items")
      .select("*")
      .in("id", availableIds)
      .eq("is_active", true)
      .order("name");

    if (mealType && mealType !== "all") {
      query = query.eq("meal_type", mealType);
    }

    const { data: items, error } = await query;

    if (error) {
      console.error("Failed to fetch menu items:", error);
      return [];
    }

    return ((items ?? []) as MenuItemRow[]).map((item) => ({
      id: item.id,
      item_key: item.item_key,
      name: item.name,
      description: item.description,
      price: item.price,
      meal_type: item.meal_type,
      available: true,
    }));
  }

  // Fallback: no daily_menu for today → return all active items
  let query = db
    .from("menu_items")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (mealType && mealType !== "all") {
    query = query.eq("meal_type", mealType);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error("Failed to fetch menu items (fallback):", error);
    return [];
  }

  return ((items ?? []) as MenuItemRow[]).map((item) => ({
    id: item.id,
    item_key: item.item_key,
    name: item.name,
    description: item.description,
    price: item.price,
    meal_type: item.meal_type,
    available: true,
  }));
}

/**
 * Search menu items by name or description (case-insensitive).
 * Only searches today's available items.
 */
export async function searchMenuItem(
  query: string
): Promise<DailyMenuItemRow[]> {
  const items = await getTodaysMenu();
  const q = query.toLowerCase();

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
  );
}

// ─── Business Config ────────────────────────────────────────────

/**
 * Get food business configuration.
 */
export async function getFoodBusinessConfig(): Promise<FoodBusinessConfigRow> {
  const db = supabase();

  const { data, error } = await db
    .from("food_business_config")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) {
    console.error("Failed to fetch food business config:", error);
    throw error ?? new Error("No food business config found");
  }

  return data as FoodBusinessConfigRow;
}

/**
 * Update the per-client "meals we serve" master switches on the single
 * business config row.
 */
export async function updateServedMeals(serves: {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}): Promise<void> {
  const db = supabase();

  // There is exactly one config row — find its id, then update by id
  // (Supabase requires a filter on UPDATE).
  const { data: cfg, error: fetchErr } = await db
    .from("food_business_config")
    .select("id")
    .limit(1)
    .single();

  if (fetchErr || !cfg) {
    console.error("Failed to load config for served-meals update:", fetchErr);
    throw fetchErr ?? new Error("No food business config found");
  }

  const { error } = await db
    .from("food_business_config")
    .update({
      serves_breakfast: serves.breakfast,
      serves_lunch: serves.lunch,
      serves_dinner: serves.dinner,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (cfg as { id: string }).id);

  if (error) {
    console.error("Failed to update served meals:", error);
    throw error;
  }
}

// ─── Food Orders ────────────────────────────────────────────────

/**
 * Save a confirmed food order.
 */
export async function saveFoodOrder(order: {
  conversation_id?: string;
  customer_phone: string;
  customer_name?: string;
  items_text: string;
  total: number;
  delivery_type: "delivery" | "pickup";
  delivery_address?: string;
  meal_type: string;
  notes?: string;
}): Promise<FoodOrderRow> {
  const db = supabase();

  const { data, error } = await db
    .from("food_orders")
    .insert({
      conversation_id: order.conversation_id ?? null,
      customer_phone: order.customer_phone,
      customer_name: order.customer_name ?? null,
      items_json: [{ name: order.items_text, qty: 1, price: order.total }],
      items_text: order.items_text,
      total: order.total,
      delivery_type: order.delivery_type,
      delivery_address: order.delivery_address ?? null,
      meal_type: order.meal_type,
      notes: order.notes ?? null,
      status: "confirmed",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("Failed to save food order:", error);
    throw error ?? new Error("Failed to save food order");
  }

  return data as FoodOrderRow;
}

/**
 * Get recent food orders, most recent first (for the kitchen orders page).
 */
export async function getFoodOrders(limit = 100): Promise<FoodOrderRow[]> {
  const db = supabase();

  const { data, error } = await db
    .from("food_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch food orders:", error);
    return [];
  }

  return (data ?? []) as FoodOrderRow[];
}

/**
 * Update a single food order's status.
 * Allowed values (enforced by the DB CHECK constraint):
 * confirmed | preparing | out_for_delivery | delivered | cancelled
 */
export async function updateFoodOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  const db = supabase();

  const { error } = await db
    .from("food_orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    console.error("Failed to update food order status:", error);
    throw error;
  }
}

// ─── Admin / Kitchen Page Queries ───────────────────────────────

/**
 * Get all active master items (for admin menu management page).
 */
export async function getAllMasterItems(): Promise<MenuItemRow[]> {
  const db = supabase();

  const { data, error } = await db
    .from("menu_items")
    .select("*")
    .eq("is_active", true)
    .order("meal_type")
    .order("name");

  if (error) {
    console.error("Failed to fetch master items:", error);
    return [];
  }

  return (data ?? []) as MenuItemRow[];
}

/**
 * Get all active items with their daily availability status for a given date.
 * Items without a daily_menu row show as available=false.
 */
export async function getDailyMenuStatus(
  date?: string
): Promise<Array<MenuItemRow & { available: boolean }>> {
  const db = supabase();
  const targetDate = date ?? getTodayIST();

  // Get all active menu items
  const items = await getAllMasterItems();

  // Get daily_menu rows for the target date
  const { data: dailyRows, error } = await db
    .from("daily_menu")
    .select("menu_item_id, available")
    .eq("date", targetDate);

  if (error) {
    console.error("Failed to fetch daily menu status:", error);
  }

  // Build a map of menu_item_id → available
  const dailyMap = new Map<string, boolean>();
  for (const row of (dailyRows ?? []) as Array<{ menu_item_id: string; available: boolean }>) {
    dailyMap.set(row.menu_item_id, row.available);
  }

  // Merge: if no daily_menu row exists, default to false (not available)
  return items.map((item) => ({
    ...item,
    available: dailyMap.get(item.id) ?? false,
  }));
}

/**
 * Bulk update daily menu toggles for today.
 */
export async function updateDailyMenu(
  items: Array<{ menu_item_id: string; available: boolean }>
): Promise<void> {
  const db = supabase();
  const today = getTodayIST();

  // Upsert each item
  for (const item of items) {
    const { error } = await db
      .from("daily_menu")
      .upsert(
        {
          menu_item_id: item.menu_item_id,
          date: today,
          available: item.available,
        },
        { onConflict: "menu_item_id,date" }
      );

    if (error) {
      console.error(
        `Failed to update daily_menu for ${item.menu_item_id}:`,
        error
      );
    }
  }
}
