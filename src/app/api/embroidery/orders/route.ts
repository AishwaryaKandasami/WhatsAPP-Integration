import { NextRequest, NextResponse } from "next/server";
import {
  getEmbroideryOrders,
  updateEmbroideryOrderStatus,
} from "@/lib/db/embroidery-queries";

const ALLOWED_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "done",
  "cancelled",
];

// Shares the owner login with the kitchen pages (one KITCHEN_PIN / kitchen_auth).
function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.get("kitchen_auth")?.value === "true";
}

/**
 * GET /api/embroidery/orders
 * Returns recent embroidery orders (most recent first).
 */
export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await getEmbroideryOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Failed to get embroidery orders:", error);
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/embroidery/orders
 * Update an order's status. Body: { orderId: string, status: string }
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
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await updateEmbroideryOrderStatus(orderId, status);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update embroidery order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}
