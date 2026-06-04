import { NextRequest, NextResponse } from "next/server";
import { getFoodOrders, updateFoodOrderStatus } from "@/lib/db/food-queries";

const ALLOWED_STATUSES = [
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.get("kitchen_auth")?.value === "true";
}

/**
 * GET /api/kitchen/orders
 *
 * Returns recent food orders (most recent first) for the kitchen dashboard.
 */
export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await getFoodOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Failed to get orders:", error);
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kitchen/orders
 *
 * Update an order's status.
 * Body: { orderId: string, status: string }
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { orderId, status } = await request.json();

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    await updateFoodOrderStatus(orderId, status);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}
