import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/kitchen/auth
 *
 * Verify kitchen PIN and set auth cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    if (!pin || typeof pin !== "string") {
      return NextResponse.json(
        { success: false, error: "PIN is required" },
        { status: 400 }
      );
    }

    const kitchenPin = process.env.KITCHEN_PIN;

    if (!kitchenPin) {
      console.error("KITCHEN_PIN env var not set");
      return NextResponse.json(
        { success: false, error: "Kitchen auth not configured" },
        { status: 500 }
      );
    }

    if (pin !== kitchenPin) {
      return NextResponse.json(
        { success: false, error: "Invalid PIN" },
        { status: 401 }
      );
    }

    // Set auth cookie — valid for 24 hours
    const response = NextResponse.json({ success: true });
    response.cookies.set("kitchen_auth", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (error) {
    console.error("Kitchen auth error:", error);
    return NextResponse.json(
      { success: false, error: "Auth failed" },
      { status: 500 }
    );
  }
}
