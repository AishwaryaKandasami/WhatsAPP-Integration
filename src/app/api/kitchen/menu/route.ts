import { NextRequest, NextResponse } from "next/server";
import {
  getDailyMenuStatus,
  updateDailyMenu,
  getFoodBusinessConfig,
  updateServedMeals,
} from "@/lib/db/food-queries";

function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.get("kitchen_auth")?.value === "true";
}

/**
 * GET /api/kitchen/menu
 *
 * Returns all menu items with their daily availability status.
 */
export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const items = await getDailyMenuStatus();

    // Group by meal type
    const grouped = {
      breakfast: items.filter((i) => i.meal_type === "breakfast"),
      lunch: items.filter((i) => i.meal_type === "lunch"),
      dinner: items.filter((i) => i.meal_type === "dinner"),
    };

    // Per-client "meals we serve" switches. Default all true (and treat a
    // missing flag as true) so the page still works before the 004 migration.
    let servedMeals = { breakfast: true, lunch: true, dinner: true };
    try {
      const cfg = await getFoodBusinessConfig();
      servedMeals = {
        breakfast: cfg.serves_breakfast !== false,
        lunch: cfg.serves_lunch !== false,
        dinner: cfg.serves_dinner !== false,
      };
    } catch {
      // Config unreadable — keep defaults (all served).
    }

    return NextResponse.json({ items: grouped, servedMeals });
  } catch (error) {
    console.error("Failed to get menu status:", error);
    return NextResponse.json(
      { error: "Failed to load menu" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kitchen/menu
 *
 * Update daily menu toggles.
 * Body: { items: [{ menu_item_id: string, available: boolean }] }
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { items, servedMeals } = await request.json();

    let didSomething = false;

    if (Array.isArray(items)) {
      await updateDailyMenu(items);
      didSomething = true;
    }

    if (servedMeals && typeof servedMeals === "object") {
      await updateServedMeals({
        breakfast: !!servedMeals.breakfast,
        lunch: !!servedMeals.lunch,
        dinner: !!servedMeals.dinner,
      });
      didSomething = true;
    }

    if (!didSomething) {
      return NextResponse.json(
        { error: "Invalid request body — expected { items: [...] } and/or { servedMeals: {...} }" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update menu:", error);
    return NextResponse.json(
      { error: "Failed to update menu" },
      { status: 500 }
    );
  }
}
