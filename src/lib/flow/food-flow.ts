import { getTodaysMenu, saveFoodOrder, getFoodBusinessConfig } from "@/lib/db/food-queries";
import type { DailyMenuItemRow } from "@/lib/db/food-queries";
import { checkFaq } from "./faq-router";
import type { FlowMessage, MessageInput } from "./types";

// ─── Types ──────────────────────────────────────────────────────

export type FlowState =
  | "start"
  | "language_select"
  | "greeting"
  | "menu_shown"
  | "item_added"
  | "cart_review"
  | "delivery_choice"
  | "address_input"
  | "order_summary"
  | "confirmed";

export interface CartItem {
  item_key: string;
  name: string;
  qty: number;
  price: number;
}

export interface FlowData {
  cart: CartItem[];
  meal_type: string | null;
  language: "english" | "tamil" | null;
  // The customer's opening message, stashed while we ask for language so we can
  // honor it (a named meal or an item order) once the language is chosen.
  pending_message: string | null;
  delivery_type: "delivery" | "pickup" | null;
  delivery_address: string | null;
  total: number;
  pending_item: { item_key: string; name: string; price: number } | null;
}

// FlowMessage & MessageInput are shared across bots — defined in ./types.
// Re-exported so existing imports from "@/lib/flow/food-flow" keep working.
export type { FlowMessage, MessageInput };

export interface FlowResult {
  newState: FlowState;
  newData: FlowData;
  messages: FlowMessage[];
  needsAI?: boolean;
  orderConfirmed?: boolean;
  orderSummary?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function emptyFlowData(): FlowData {
  return {
    cart: [],
    meal_type: null,
    language: null,
    pending_message: null,
    delivery_type: null,
    delivery_address: null,
    total: 0,
    pending_item: null,
  };
}

// Reset the order but keep the language the customer already chose, so we don't
// re-ask "English or Tamil?" after every order within the same session.
function resetKeepingLanguage(data: FlowData): FlowData {
  return { ...emptyFlowData(), language: data.language };
}

// Localized greeting/sign-off. English mode stays clean English (no Tamil words)
// so non-Tamil speakers aren't defaulted into Tamil; Tamil mode adds Tanglish.
function hello(language: FlowData["language"]): string {
  return language === "tamil" ? "Vanakkam! " : "";
}

function thanks(language: FlowData["language"]): string {
  return language === "tamil" ? "Nandri!" : "Thank you!";
}

function calculateTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function formatCart(cart: CartItem[]): string {
  return cart
    .map((item) => `${item.qty}x ${item.name} = Rs.${item.price * item.qty}`)
    .join("\n");
}

function getMealTypeForTime(): string {
  const now = new Date();
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);
  const hour = ist.getHours();

  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}

// The bot's display name. Per-client and set once per deploy via
// SELLER_BUSINESS_NAME (falls back to the Supabase config, then a generic) so a
// new kitchen never sees another business's name in its greetings.
async function getBusinessName(): Promise<string> {
  if (process.env.SELLER_BUSINESS_NAME) return process.env.SELLER_BUSINESS_NAME;
  try {
    const cfg = await getFoodBusinessConfig();
    if (cfg?.business_name) return cfg.business_name;
  } catch {
    // config unreadable — fall through to the generic name
  }
  return "our kitchen";
}

// Read an explicitly-named meal out of free text ("lunch menu please",
// "saapadu venum", "morning tiffin"). Returns null when no meal is named.
function parseMealFromText(text?: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("breakfast") || t.includes("morning") || t.includes("tiffin")) return "breakfast";
  if (t.includes("lunch") || t.includes("afternoon") || t.includes("saapadu")) return "lunch";
  if (t.includes("dinner") || t.includes("evening") || t.includes("night")) return "dinner";
  return null;
}

// Which meals can still be ordered right now (IST):
//   before 12 PM → breakfast, lunch, dinner   (whole day still open)
//   12 PM–2 PM   → lunch, dinner
//   after 2 PM   → dinner only
// Narrowed further by what the client actually offers (see computeAvailableMeals).
function getAvailableMealsForTime(): string[] {
  const now = new Date();
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);
  const hour = ist.getHours();

  if (hour < 12) return ["breakfast", "lunch", "dinner"];
  if (hour < 14) return ["lunch", "dinner"];
  return ["dinner"];
}

function getDeliveryEstimate(mealType: string): string {
  switch (mealType) {
    case "breakfast": return "7:30 AM - 9:30 AM";
    case "lunch": return "12:00 PM - 1:30 PM";
    case "dinner": return "7:30 PM - 9:00 PM";
    default: return "30-45 minutes";
  }
}

// Attempt to parse a quantity from text like "2", "two", "3x", etc.
function parseQuantity(text: string): number | null {
  const cleaned = text.trim().toLowerCase();
  const numberWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    oru: 1, rendu: 2, moonu: 3, naalu: 4, anju: 5, // Tanglish
  };

  if (numberWords[cleaned]) return numberWords[cleaned];

  const match = cleaned.match(/^(\d+)/);
  if (match) return parseInt(match[1], 10);

  return null;
}

// Try to find a menu item matching text input.
function findItemInMenu(text: string, items: DailyMenuItemRow[]): DailyMenuItemRow | null {
  const q = text.toLowerCase().trim();
  if (!q) return null;
  // Exact name match first
  const exact = items.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  // The message contains the full item name, e.g. "i want idli set please".
  const containsName = items.find((i) => q.includes(i.name.toLowerCase()));
  if (containsName) return containsName;
  // The query is a substring of an item name, e.g. "biryani" → "Chicken Biryani".
  // Require length >= 4 so short greetings ("hi") don't match inside "chicken".
  if (q.length >= 4) {
    const partial = items.find((i) => i.name.toLowerCase().includes(q));
    if (partial) return partial;
  }
  // Distinctive leading word of an item appears as a whole word in the message,
  // e.g. "2 idli parcel venum" → "Idli Set (4 pcs)". Requiring the item's first
  // word (idli, dosa, sambar…) to be length >= 3 avoids matching filler words.
  const words = new Set(q.split(/\s+/).map((w) => w.replace(/[^a-z]/g, "")));
  const byKeyword = items.find((i) => {
    const first = i.name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "");
    return first.length >= 3 && words.has(first);
  });
  return byKeyword ?? null;
}

// ─── Flow Engine ────────────────────────────────────────────────

export async function handleFlowStep(
  state: FlowState,
  data: FlowData,
  input: MessageInput,
  context: { customerPhone?: string; conversationId?: string; customerName?: string }
): Promise<FlowResult> {
  // ── Layer 1: FAQ router ──────────────────────────────────────────
  // Only intercept plain text (never button/list clicks — those are flow input).
  // An FAQ answer does NOT change state/data, so the customer keeps their place
  // in the order flow.
  if (input.type === "text" && input.text) {
    const faq = await checkFaq(input.text);
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
      return handleStart(data, input);
    case "language_select":
      return handleLanguageSelect(data, input);
    case "greeting":
      return handleGreeting(data, input);
    case "menu_shown":
      return handleMenuShown(data, input);
    case "item_added":
      return handleItemAdded(data, input);
    case "cart_review":
      return handleCartReview(data, input);
    case "delivery_choice":
      return handleDeliveryChoice(data, input);
    case "address_input":
      return handleAddressInput(data, input);
    case "order_summary":
      return handleOrderSummary(data, input, context);
    case "confirmed":
      // After confirmation, treat any new message as a fresh start (keeping language)
      return handleStart(resetKeepingLanguage(data), input);
    default:
      return handleStart(resetKeepingLanguage(data), input);
  }
}

// ─── State Handlers ─────────────────────────────────────────────

async function handleStart(data: FlowData, input: MessageInput): Promise<FlowResult> {
  // First contact — establish the language before anything else, so non-Tamil
  // speakers are never defaulted into Tamil. Stash their opening message so we
  // can honor it (a named meal, or an item order) once the language is known.
  if (!data.language) {
    return showLanguagePicker(input.text);
  }

  // Language already known (fresh start, or a new order after one completed):
  // honor any meal/item in the message instead of just re-showing the menu.
  if (input.text) {
    return replayFirstMessage(data.language, input.text);
  }

  return showStartMenu(data.language);
}

/**
 * Ask the customer to pick a language before the ordering flow begins.
 * `pendingMessage` is their opening line, stashed so we can act on it after.
 */
function showLanguagePicker(pendingMessage?: string | null): FlowResult {
  return {
    newState: "language_select",
    newData: { ...emptyFlowData(), pending_message: pendingMessage ?? null },
    messages: [
      {
        type: "buttons",
        text: "Welcome! Please choose your language.\nமொழியைத் தேர்ந்தெடுக்கவும்.",
        buttons: [
          { id: "lang_english", title: "English" },
          { id: "lang_tamil", title: "தமிழ் / Tamil" },
        ],
      },
    ],
  };
}

async function handleLanguageSelect(data: FlowData, input: MessageInput): Promise<FlowResult> {
  let language: FlowData["language"] = null;

  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "lang_english") language = "english";
    else if (input.interactionId === "lang_tamil") language = "tamil";
  }

  if (!language && input.text) {
    const t = input.text.toLowerCase();
    if (t.includes("tamil") || t.includes("தமிழ்") || t.includes("tanglish")) language = "tamil";
    else if (t.includes("english")) language = "english";
  }

  // Didn't understand the choice — ask again, keeping their original message.
  if (!language) return showLanguagePicker(data.pending_message);

  // Now that we know the language, act on the message they opened with.
  if (data.pending_message) {
    return replayFirstMessage(language, data.pending_message);
  }

  return showStartMenu(language);
}

/**
 * Process the customer's opening message now that the language is known.
 *   - names an available meal ("lunch menu please")  → open that meal's menu
 *   - names a closed meal ("lunch" at dinner time)    → say so, show what's open
 *   - names an item ("2 idli parcel venum")           → match it and ask quantity
 *   - names an item served at another meal today       → say when it's available
 *   - anything else (a greeting, "what's today?")     → just show today's menu
 * Deterministic only (no AI) so the first reply stays instant.
 */
async function replayFirstMessage(
  language: FlowData["language"],
  text: string
): Promise<FlowResult> {
  const base: FlowData = { ...emptyFlowData(), language };
  const available = await computeAvailableMeals();

  // (a) Opened by naming a meal.
  const requested = parseMealFromText(text);
  if (requested) {
    if (available.includes(requested)) {
      return showMealMenu(base, requested, true);
    }
    // Named a meal that's closed right now — say so, then show what's open.
    return prefixMessage(
      `Sorry, we're not taking ${requested} orders right now. Here's what you can order:`,
      await openAvailableMeals(base, available, language)
    );
  }

  if (available.length === 0) {
    return showStartMenu(language);
  }

  // (b) Not a meal — open the current-time menu, then check for an item order.
  const meal = available.includes(getMealTypeForTime())
    ? getMealTypeForTime()
    : available[0];
  const menu = await showMealMenu(base, meal, true);

  const follow = await handleMenuShown(menu.newData, { text, type: "text" });
  if (follow.newState === "item_added") {
    // Matched an item on the current menu — greet, then ask quantity.
    const greeting = menu.messages.find((m) => m.type === "text");
    return {
      ...follow,
      messages: greeting ? [greeting, ...follow.messages] : follow.messages,
    };
  }

  // (c) The item they asked for may be served at a different meal today.
  const elsewhere = findItemInMenu(text, await getTodaysMenu());
  if (elsewhere && elsewhere.meal_type !== meal) {
    const listOnly = menu.messages.filter((m) => m.type !== "text");
    return {
      ...menu,
      messages: [
        {
          type: "text",
          text: `${elsewhere.name} is on our ${elsewhere.meal_type} menu — we're serving ${meal} right now. Here's today's ${meal}:`,
        },
        ...listOnly,
      ],
    };
  }

  // (d) Nothing recognised — just show the menu (skip the AI nudge to stay snappy).
  return menu;
}

/** Prepend a text line to an existing flow result's messages. */
function prefixMessage(text: string, result: FlowResult): FlowResult {
  return { ...result, messages: [{ type: "text", text }, ...result.messages] };
}

/** Open whatever meals are orderable now: the single menu, or a meal picker. */
async function openAvailableMeals(
  base: FlowData,
  available: string[],
  language: FlowData["language"]
): Promise<FlowResult> {
  if (available.length === 0) return showStartMenu(language);
  if (available.length === 1) return showMealMenu(base, available[0], false);
  const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
  return {
    newState: "greeting",
    newData: base,
    messages: [
      {
        type: "buttons",
        text: "What would you like to order?",
        buttons: available.map((m) => ({ id: `meal_${m}`, title: label(m) })),
      },
    ],
  };
}

async function handleGreeting(data: FlowData, input: MessageInput): Promise<FlowResult> {
  let mealType: string | null = null;

  // Check for button reply
  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "meal_breakfast") mealType = "breakfast";
    else if (input.interactionId === "meal_lunch") mealType = "lunch";
    else if (input.interactionId === "meal_dinner") mealType = "dinner";
  }

  // Check for text-based meal selection
  if (!mealType && input.text) {
    mealType = parseMealFromText(input.text);
  }

  if (!mealType) {
    // Couldn't read a meal from the tap/text — keep the one they're already on
    // (e.g. "Add More" mid-order), otherwise fall back to the current meal by time.
    mealType = data.meal_type ?? getMealTypeForTime();
  }

  return showMealMenu(data, mealType, false);
}

/**
 * Meals we can actually take orders for at this moment:
 *   (allowed by the current IST time window) ∩ (the client has items for today).
 * This is what makes the bot adapt per client — a kitchen that doesn't do lunch
 * simply has no lunch items, so lunch never appears. The owner controls this from
 * the kitchen menu page by toggling items per meal.
 */
async function computeAvailableMeals(): Promise<string[]> {
  const MEAL_ORDER = ["breakfast", "lunch", "dinner"];
  const timeWindow = getAvailableMealsForTime();

  // Master switches: meals the client serves at all (kitchen page).
  // `!== false` means an unset/missing flag defaults to "served" — keeps the
  // bot working even before the 004 migration adds these columns.
  const served = new Set<string>(MEAL_ORDER);
  try {
    const cfg = await getFoodBusinessConfig();
    if (cfg.serves_breakfast === false) served.delete("breakfast");
    if (cfg.serves_lunch === false) served.delete("lunch");
    if (cfg.serves_dinner === false) served.delete("dinner");
  } catch {
    // Config unreadable — fail open (treat all meals as served).
  }

  // Daily reality: meals that actually have items today.
  const todaysItems = await getTodaysMenu();
  const offered = new Set(todaysItems.map((i) => i.meal_type));

  return MEAL_ORDER.filter(
    (m) => timeWindow.includes(m) && served.has(m) && offered.has(m)
  );
}

/**
 * First-message entry point.
 *   • 0 meals available → "not taking orders" note
 *   • 1 meal           → jump straight into that menu (no pointless picker)
 *   • 2-3 meals        → greet + show only those meal-type buttons
 */
async function showStartMenu(language: FlowData["language"]): Promise<FlowResult> {
  const available = await computeAvailableMeals();
  const businessName = await getBusinessName();
  const hi = hello(language);
  const base: FlowData = { ...emptyFlowData(), language };

  if (available.length === 0) {
    return {
      newState: "start",
      newData: base,
      messages: [
        {
          type: "text",
          text: `${hi}${businessName} isn't taking orders right now. Please check back during our serving hours.`,
        },
      ],
    };
  }

  if (available.length === 1) {
    return showMealMenu(base, available[0], true);
  }

  const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
  return {
    newState: "greeting",
    newData: base,
    messages: [
      {
        type: "buttons",
        text: `${hi}Welcome to ${businessName}! What would you like to order?`,
        buttons: available.map((m) => ({ id: `meal_${m}`, title: label(m) })),
      },
    ],
  };
}

/**
 * Show the menu for a given meal as a tappable list.
 * `withGreeting` adds the welcome line (used on the very first message).
 * Falls back to meal-type buttons only if the meal has no items today.
 */
async function showMealMenu(
  data: FlowData,
  mealType: string,
  withGreeting: boolean
): Promise<FlowResult> {
  const items = await getTodaysMenu(mealType);
  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const businessName = await getBusinessName();
  const hi = hello(data.language);

  if (items.length === 0) {
    // The requested meal has nothing today — offer the other meals that are both
    // on the clock AND stocked, never one outside the current time window.
    const available = await computeAvailableMeals();
    if (available.length === 0) {
      return {
        newState: "start",
        newData: resetKeepingLanguage(data),
        messages: [
          {
            type: "text",
            text: `${hi}${businessName} isn't taking orders right now. Please check back during our serving hours.`,
          },
        ],
      };
    }
    const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
    return {
      newState: "greeting",
      newData: { ...data, meal_type: null },
      messages: [
        {
          type: "buttons",
          text: withGreeting
            ? `${hi}Welcome to ${businessName}! No ${mealType} right now — pick another:`
            : `No ${mealType} items today. Try another meal:`,
          buttons: available.map((m) => ({ id: `meal_${m}`, title: label(m) })),
        },
      ],
    };
  }

  const rows = items.map((item) => ({
    id: `item_${item.item_key}`,
    title: item.name.slice(0, 24),
    description: `Rs.${item.price} - ${item.description}`.slice(0, 72),
  }));

  const messages: FlowMessage[] = [];
  if (withGreeting) {
    messages.push({
      type: "text",
      text: `${hi}Welcome to ${businessName}! It's ${mealType} time.`,
    });
  }
  messages.push({
    type: "list",
    text: `Today's ${mealLabel} menu — tap an item to order. (For another meal, type breakfast, lunch, or dinner.)`,
    listButtonText: "View Menu",
    listSections: [{ title: `${mealLabel} Items`, rows }],
  });

  return {
    newState: "menu_shown",
    newData: { ...data, meal_type: mealType },
    messages,
  };
}

async function handleMenuShown(data: FlowData, input: MessageInput): Promise<FlowResult> {
  // Allow switching meals from the menu view (e.g. customer types "breakfast").
  // Require the message to be essentially just the meal word so we don't hijack
  // item orders like "2 sambar rice".
  if (input.type === "text" && input.text) {
    const t = input.text.toLowerCase().trim();
    const switchMeal = /^(breakfast|tiffin)(\s*menu)?$/.test(t)
      ? "breakfast"
      : /^(lunch|saapadu)(\s*menu)?$/.test(t)
        ? "lunch"
        : /^dinner(\s*menu)?$/.test(t)
          ? "dinner"
          : null;
    if (switchMeal && switchMeal !== data.meal_type) {
      return showMealMenu(data, switchMeal, false);
    }
  }

  // User selected an item from the list
  let selectedItem: DailyMenuItemRow | null = null;

  if (input.type === "list_reply" && input.interactionId) {
    // Extract item_key from interaction ID (format: "item_sambar-rice")
    const itemKey = input.interactionId.replace("item_", "");
    const items = await getTodaysMenu(data.meal_type ?? undefined);
    selectedItem = items.find((i) => i.item_key === itemKey) ?? null;
  }

  if (!selectedItem && input.text) {
    // Try to match free text to a menu item
    const items = await getTodaysMenu(data.meal_type ?? undefined);
    selectedItem = findItemInMenu(input.text, items);
  }

  if (!selectedItem) {
    // Can't identify item — needs AI or re-show menu
    return {
      newState: "menu_shown",
      newData: data,
      messages: [
        {
          type: "text",
          text: "I couldn't find that item. Please select from the menu:",
        },
      ],
      needsAI: true, // Let AI try to parse
    };
  }

  // Store pending item and ask for quantity
  const newData: FlowData = {
    ...data,
    pending_item: {
      item_key: selectedItem.item_key,
      name: selectedItem.name,
      price: selectedItem.price,
    },
  };

  return {
    newState: "item_added",
    newData,
    messages: [
      {
        type: "buttons",
        text: `${selectedItem.name} - Rs.${selectedItem.price}\nHow many?`,
        buttons: [
          { id: "qty_1", title: "1" },
          { id: "qty_2", title: "2" },
          { id: "qty_3", title: "3" },
        ],
      },
    ],
  };
}

async function handleItemAdded(data: FlowData, input: MessageInput): Promise<FlowResult> {
  if (!data.pending_item) {
    // No pending item — go back to menu
    return handleGreeting(data, input);
  }

  let qty: number | null = null;

  // Check button reply
  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "qty_1") qty = 1;
    else if (input.interactionId === "qty_2") qty = 2;
    else if (input.interactionId === "qty_3") qty = 3;
  }

  // Check text input for quantity
  if (qty === null && input.text) {
    qty = parseQuantity(input.text);
  }

  if (qty === null || qty <= 0 || qty > 20) {
    return {
      newState: "item_added",
      newData: data,
      messages: [
        {
          type: "buttons",
          text: `Please select a quantity for ${data.pending_item.name}:`,
          buttons: [
            { id: "qty_1", title: "1" },
            { id: "qty_2", title: "2" },
            { id: "qty_3", title: "3" },
          ],
        },
      ],
    };
  }

  // Add to cart
  const existingIndex = data.cart.findIndex(
    (c) => c.item_key === data.pending_item!.item_key
  );
  const newCart = [...data.cart];
  if (existingIndex >= 0) {
    newCart[existingIndex] = { ...newCart[existingIndex], qty: newCart[existingIndex].qty + qty };
  } else {
    newCart.push({
      item_key: data.pending_item.item_key,
      name: data.pending_item.name,
      qty,
      price: data.pending_item.price,
    });
  }

  const total = calculateTotal(newCart);
  const newData: FlowData = {
    ...data,
    cart: newCart,
    total,
    pending_item: null,
  };

  // Show cart summary with Add More / Checkout
  const cartSummary = formatCart(newCart);

  return {
    newState: "cart_review",
    newData,
    messages: [
      {
        type: "text",
        text: `Added ${qty}x ${data.pending_item.name}!\n\nYour cart:\n${cartSummary}\n\nTotal: Rs.${total}`,
      },
      {
        type: "buttons",
        text: "What would you like to do?",
        buttons: [
          { id: "add_more", title: "Add More Items" },
          { id: "checkout", title: "Checkout" },
        ],
      },
    ],
  };
}

async function handleCartReview(data: FlowData, input: MessageInput): Promise<FlowResult> {
  // Check button
  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "add_more") {
      // Go back to menu for the same meal type
      return handleGreeting(data, input);
    }
    if (input.interactionId === "checkout") {
      return goToDeliveryChoice(data);
    }
  }

  // Check text
  if (input.text) {
    const t = input.text.toLowerCase();
    if (t.includes("add") || t.includes("more") || t.includes("vendum")) {
      return handleGreeting(data, input);
    }
    if (
      t.includes("checkout") || t.includes("done") || t.includes("order") ||
      t.includes("confirm") || t.includes("yes") || t.includes("ok") || t.includes("proceed")
    ) {
      return goToDeliveryChoice(data);
    }
  }

  // Unclear — show buttons again
  return {
    newState: "cart_review",
    newData: data,
    messages: [
      {
        type: "buttons",
        text: `Your cart: Rs.${data.total}\nAdd more or checkout?`,
        buttons: [
          { id: "add_more", title: "Add More Items" },
          { id: "checkout", title: "Checkout" },
        ],
      },
    ],
  };
}

async function goToDeliveryChoice(data: FlowData): Promise<FlowResult> {
  // Check minimum order
  let config;
  try {
    config = await getFoodBusinessConfig();
  } catch {
    config = null;
  }

  const minOrder = config?.minimum_order ?? 0;
  if (data.total < minOrder) {
    return {
      newState: "cart_review",
      newData: data,
      messages: [
        {
          type: "text",
          text: `Minimum order is Rs.${minOrder}. Your total is Rs.${data.total}. Please add more items.`,
        },
        {
          type: "buttons",
          text: "What would you like to do?",
          buttons: [
            { id: "add_more", title: "Add More Items" },
          ],
        },
      ],
    };
  }

  return {
    newState: "delivery_choice",
    newData: data,
    messages: [
      {
        type: "buttons",
        text: "Delivery or pickup?",
        buttons: [
          { id: "delivery", title: "Delivery" },
          { id: "pickup", title: "Pickup" },
        ],
      },
    ],
  };
}

async function handleDeliveryChoice(data: FlowData, input: MessageInput): Promise<FlowResult> {
  let choice: "delivery" | "pickup" | null = null;

  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "delivery") choice = "delivery";
    else if (input.interactionId === "pickup") choice = "pickup";
  }

  if (!choice && input.text) {
    const t = input.text.toLowerCase();
    if (t.includes("delivery") || t.includes("deliver")) choice = "delivery";
    else if (t.includes("pickup") || t.includes("pick")) choice = "pickup";
  }

  if (!choice) {
    return {
      newState: "delivery_choice",
      newData: data,
      messages: [
        {
          type: "buttons",
          text: "Please choose: delivery or pickup?",
          buttons: [
            { id: "delivery", title: "Delivery" },
            { id: "pickup", title: "Pickup" },
          ],
        },
      ],
    };
  }

  const newData: FlowData = { ...data, delivery_type: choice };

  if (choice === "pickup") {
    // Skip address, go to order summary
    return showOrderSummary(newData);
  }

  // Ask for delivery address
  return {
    newState: "address_input",
    newData,
    messages: [
      {
        type: "text",
        text: "Please send your delivery address (area/street name):",
      },
    ],
  };
}

async function handleAddressInput(data: FlowData, input: MessageInput): Promise<FlowResult> {
  if (!input.text || input.text.trim().length < 3) {
    return {
      newState: "address_input",
      newData: data,
      messages: [
        {
          type: "text",
          text: "Please type your delivery address (e.g., '23 Main Road, T Nagar'):",
        },
      ],
    };
  }

  // Validate delivery area
  let config;
  try {
    config = await getFoodBusinessConfig();
  } catch {
    config = null;
  }

  const address = input.text.trim();
  const deliveryAreas = (config?.delivery_areas as string[]) ?? [];

  // Simple area check — if delivery areas are configured, check if address mentions one
  if (deliveryAreas.length > 0) {
    const addressLower = address.toLowerCase();
    const inArea = deliveryAreas.some((area) => addressLower.includes(area.toLowerCase()));
    if (!inArea) {
      return {
        newState: "delivery_choice",
        newData: data,
        messages: [
          {
            type: "text",
            text: `Sorry, we only deliver to: ${deliveryAreas.join(", ")}. Your address doesn't seem to be in our delivery area.`,
          },
          {
            type: "buttons",
            text: "Would you like to try pickup instead?",
            buttons: [
              { id: "pickup", title: "Pickup" },
              { id: "delivery", title: "Try New Address" },
            ],
          },
        ],
      };
    }
  }

  const newData: FlowData = { ...data, delivery_address: address };
  return showOrderSummary(newData);
}

async function showOrderSummary(data: FlowData): Promise<FlowResult> {
  const cartText = formatCart(data.cart);
  const deliveryText =
    data.delivery_type === "pickup"
      ? "Pickup"
      : `Delivery to: ${data.delivery_address}`;

  const mealType = data.meal_type ?? getMealTypeForTime();
  const deliveryEstimate = getDeliveryEstimate(mealType);

  const summary =
    `Order Summary:\n\n${cartText}\n\nTotal: Rs.${data.total}\n${deliveryText}\nEstimated time: ${deliveryEstimate} IST\nPayment: On delivery`;

  return {
    newState: "order_summary",
    newData: data,
    messages: [
      {
        type: "text",
        text: summary,
      },
      {
        type: "buttons",
        text: "Confirm this order?",
        buttons: [
          { id: "confirm_order", title: "Confirm Order" },
          { id: "cancel_order", title: "Cancel" },
        ],
      },
    ],
  };
}

async function handleOrderSummary(
  data: FlowData,
  input: MessageInput,
  context: { customerPhone?: string; conversationId?: string; customerName?: string }
): Promise<FlowResult> {
  let confirmed = false;

  if (input.type === "button_reply" && input.interactionId) {
    if (input.interactionId === "confirm_order") confirmed = true;
    if (input.interactionId === "cancel_order") {
      return {
        newState: "start",
        newData: resetKeepingLanguage(data),
        messages: [
          {
            type: "text",
            text: "Order cancelled. Send a message anytime to order again!",
          },
        ],
      };
    }
  }

  if (!confirmed && input.text) {
    const t = input.text.toLowerCase();
    if (t.includes("yes") || t.includes("confirm") || t.includes("ok") || t.includes("seri")) {
      confirmed = true;
    }
    if (t.includes("no") || t.includes("cancel") || t.includes("venda")) {
      return {
        newState: "start",
        newData: resetKeepingLanguage(data),
        messages: [
          {
            type: "text",
            text: "Order cancelled. Send a message anytime to order again!",
          },
        ],
      };
    }
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

  // Confirm the order — save to DB
  const mealType = data.meal_type ?? getMealTypeForTime();
  const itemsText = data.cart
    .map((c) => `${c.qty}x ${c.name}`)
    .join(", ");

  try {
    await saveFoodOrder({
      conversation_id: context.conversationId,
      customer_phone: context.customerPhone ?? "unknown",
      customer_name: context.customerName ?? "Customer",
      items_text: itemsText,
      total: data.total,
      delivery_type: data.delivery_type === "pickup" ? "pickup" : "delivery",
      delivery_address: data.delivery_address ?? undefined,
      meal_type: mealType,
    });
  } catch (err) {
    console.error("[Flow] Failed to save order:", err);
  }

  const deliveryEstimate = getDeliveryEstimate(mealType);
  const deliveryInfo =
    data.delivery_type === "pickup"
      ? "Pickup"
      : `Delivery to ${data.delivery_address}`;

  // Format seller notification
  const orderSummary = [
    `CONFIRMED ORDER`,
    ``,
    `Customer: ${context.customerName ?? "Customer"}`,
    `Items: ${itemsText}`,
    `Total: Rs.${data.total}`,
    `${data.delivery_type === "delivery" ? `Deliver to: ${data.delivery_address}` : "Pickup"}`,
    `Meal: ${mealType}`,
    ``,
    `Please prepare and deliver.`,
  ].join("\n");

  return {
    newState: "confirmed",
    newData: resetKeepingLanguage(data),
    orderConfirmed: true,
    orderSummary,
    messages: [
      {
        type: "text",
        text: `Order confirmed! ${itemsText}. Total: Rs.${data.total}. ${deliveryInfo} by ${deliveryEstimate} IST. Payment on delivery. ${thanks(data.language)}`,
      },
    ],
  };
}

// ─── Export helpers ──────────────────────────────────────────────

export { emptyFlowData };
