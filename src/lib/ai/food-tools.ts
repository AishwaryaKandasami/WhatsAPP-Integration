import { Type, type FunctionDeclaration } from "@google/genai";
import { getAllMenuItems, findMenuItem } from "./food-prompts";
import { saveFoodOrder } from "@/lib/db/food-queries";

export interface FoodToolContext {
  conversationId?: string;
  customerPhone?: string;
  customerName?: string;
}

/**
 * Tool/function declarations for the food bot
 */
export const foodFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: "get_todays_menu",
    description:
      "Get today's full menu with all items and prices. Use when customer asks what's available today or wants to see the menu.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        meal_type: {
          type: Type.STRING,
          description:
            "Which meal to show: 'breakfast', 'lunch', 'dinner', or 'all'. Default to 'all' if not specified.",
        },
      },
      required: [],
    },
  },
  {
    name: "search_menu",
    description:
      "Search for a specific item on today's menu. Use when customer asks about a specific dish.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Search query — dish name or keyword. Examples: "biryani", "dosa", "chapati"',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "confirm_order",
    description:
      "Confirm a food order. Use ONLY after the customer has agreed to the order summary (items, total, delivery/pickup). This sends a confirmed order to the kitchen.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.STRING,
          description:
            'Ordered items with quantities as a readable string. Example: "2x Sambar Rice, 1x Curd Rice, 1x Chicken Biryani"',
        },
        total: {
          type: Type.NUMBER,
          description: "Total order amount in rupees",
        },
        delivery_type: {
          type: Type.STRING,
          description: "'delivery' or 'pickup'",
        },
        delivery_address: {
          type: Type.STRING,
          description:
            "Delivery address (required if delivery_type is 'delivery')",
        },
        customer_name: {
          type: Type.STRING,
          description: "Customer name from WhatsApp profile or conversation",
        },
        meal_type: {
          type: Type.STRING,
          description: "'breakfast', 'lunch', or 'dinner'",
        },
        notes: {
          type: Type.STRING,
          description:
            "Any special instructions (less spicy, extra sambar, no onion, etc.)",
        },
      },
      required: ["items", "total", "delivery_type", "meal_type"],
    },
  },
];

/**
 * Execute a food tool call and return the result.
 * Now async — reads menu from Supabase, writes orders to Supabase.
 */
export async function executeFoodTool(
  name: string,
  input: Record<string, unknown>,
  context: FoodToolContext = {}
): Promise<Record<string, unknown>> {
  switch (name) {
    case "get_todays_menu": {
      const mealType = (input.meal_type as string) || "all";
      const items = await getAllMenuItems();

      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const result: Record<string, unknown> = { day: days[new Date().getDay()] };

      const breakfast = items.filter((i) => i.meal_type === "breakfast");
      const lunch = items.filter((i) => i.meal_type === "lunch");
      const dinner = items.filter((i) => i.meal_type === "dinner");

      if (mealType === "all" || mealType === "breakfast") {
        result.breakfast = breakfast.map((i) => ({
          name: i.name,
          price: `Rs.${i.price}`,
          description: i.description,
        }));
      }
      if (mealType === "all" || mealType === "lunch") {
        result.lunch = lunch.map((i) => ({
          name: i.name,
          price: `Rs.${i.price}`,
          description: i.description,
        }));
      }
      if (mealType === "all" || mealType === "dinner") {
        result.dinner = dinner.map((i) => ({
          name: i.name,
          price: `Rs.${i.price}`,
          description: i.description,
        }));
      }

      return result;
    }

    case "search_menu": {
      const results = await findMenuItem(input.query as string);
      if (results.length === 0) {
        return {
          found: false,
          message:
            "This item is not on today's menu. Show the customer what's available instead.",
        };
      }
      return {
        found: true,
        items: results.map((i) => ({
          name: i.name,
          price: `Rs.${i.price}`,
          description: i.description,
        })),
      };
    }

    case "confirm_order": {
      const orderId = `FOOD-${Date.now().toString(36).toUpperCase()}`;

      // Save order to Supabase
      try {
        await saveFoodOrder({
          conversation_id: context.conversationId,
          customer_phone: context.customerPhone ?? "unknown",
          customer_name: (input.customer_name as string) ?? context.customerName ?? "Customer",
          items_text: input.items as string,
          total: input.total as number,
          delivery_type: (input.delivery_type as string) === "pickup" ? "pickup" : "delivery",
          delivery_address: input.delivery_address as string | undefined,
          meal_type: input.meal_type as string,
          notes: input.notes as string | undefined,
        });
        console.log(`[Food] Order saved to DB: ${orderId}`);
      } catch (err) {
        console.error(`[Food] Failed to save order to DB:`, err);
        // Continue even if DB save fails — the order confirmation still works
      }

      return {
        success: true,
        order_id: orderId,
        summary: {
          items: input.items,
          total: `Rs.${input.total}`,
          delivery_type: input.delivery_type,
          delivery_address: input.delivery_address ?? "Pickup",
          customer_name: (input.customer_name as string) ?? context.customerName ?? "Customer",
          meal_type: input.meal_type,
          notes: input.notes ?? null,
        },
        message: "Order confirmed and sent to the kitchen.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
