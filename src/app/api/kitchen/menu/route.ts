import { NextRequest, NextResponse } from "next/server";
import { getDailyMenuStatus, updateDailyMenu } from "@/lib/db/food-queries";

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

    return NextResponse.json({ items: grouped });
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
    const { items } = await request.json();

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "Invalid request body — expected { items: [...] }" },
        { status: 400 }
      );
    }

    await updateDailyMenu(items);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update menu:", error);
    return NextResponse.json(
      { error: "Failed to update menu" },
      { status: 500 }
    );
  }
}
