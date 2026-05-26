import { Type, type FunctionDeclaration } from "@google/genai";
import { getAllDesigns, searchDesigns, getDesignById } from "../catalog";

/**
 * Tool/function declarations for Gemini
 */
export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "search_catalog",
    description:
      "Search for embroidery designs by name, type, or description. Use when customer asks about available designs or mentions a specific style.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Search query — can be design name, fabric type, or style. Examples: "peacock", "saree", "floral", "wedding"',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_all_designs",
    description:
      "Get the full list of all available embroidery designs with prices. Use when customer wants to see all options.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_order",
    description:
      "Create a new embroidery order. Use ONLY after you have collected ALL required details from the customer: design, fabric, placement, thread color, deadline, and location. Always confirm with the customer before creating.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        design_id: {
          type: Type.STRING,
          description:
            "The design ID from the catalog (e.g. 'peacock-design', 'floral-motif', 'custom-design')",
        },
        fabric: {
          type: Type.STRING,
          description:
            "Type of fabric/garment (e.g. 'silk saree', 'cotton blouse', 'kurta')",
        },
        placement: {
          type: Type.STRING,
          description:
            "Where on the garment (e.g. 'full pallu', 'border', 'sleeves', 'front panel')",
        },
        thread_color: {
          type: Type.STRING,
          description:
            "Preferred thread color (e.g. 'gold', 'silver', 'red', 'multicolor')",
        },
        deadline: {
          type: Type.STRING,
          description:
            "When the customer needs it (e.g. '2 weeks', 'by June 15', '10 days')",
        },
        location: {
          type: Type.STRING,
          description: "Customer location for pickup/delivery",
        },
        customer_name: {
          type: Type.STRING,
          description:
            "Customer name (from WhatsApp profile or conversation)",
        },
        notes: {
          type: Type.STRING,
          description:
            "Any additional notes (custom design description, special requests, reference image notes)",
        },
      },
      required: [
        "design_id",
        "fabric",
        "placement",
        "thread_color",
        "deadline",
        "location",
      ],
    },
  },
  {
    name: "get_pricing",
    description:
      "Get the price for a specific design. Use when customer asks about pricing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        design_id: {
          type: Type.STRING,
          description: "The design ID to get pricing for",
        },
      },
      required: ["design_id"],
    },
  },
];

/**
 * Execute a tool call and return the result
 */
export function executeTool(
  name: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  switch (name) {
    case "search_catalog": {
      const results = searchDesigns(input.query as string);
      if (results.length === 0) {
        return {
          found: false,
          message:
            "No matching designs found. Suggest browsing all designs or a custom order.",
        };
      }
      return {
        found: true,
        designs: results.map((d) => ({
          id: d.id,
          name: d.name,
          name_tamil: d.name_tamil,
          price: d.price > 0 ? `₹${d.price}` : "Price varies",
          turnaround: `${d.turnaround_days} days`,
          suitable_for: d.suitable_for,
          note: d.note,
        })),
      };
    }

    case "get_all_designs": {
      const designs = getAllDesigns();
      return {
        designs: designs.map((d) => ({
          id: d.id,
          name: d.name,
          name_tamil: d.name_tamil,
          price: d.price > 0 ? `₹${d.price}` : "Price varies",
          turnaround: `${d.turnaround_days} days`,
          note: d.note,
        })),
      };
    }

    case "create_order": {
      const design = getDesignById(input.design_id as string);
      const designName = design?.name ?? (input.design_id as string);
      const price = design?.price ?? 0;
      const turnaround = design?.turnaround_days ?? 14;

      // Generate a simple order ID
      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;

      return {
        success: true,
        order_id: orderId,
        summary: {
          design: designName,
          fabric: input.fabric,
          placement: input.placement,
          thread_color: input.thread_color,
          deadline: input.deadline,
          location: input.location,
          customer_name: input.customer_name ?? "Customer",
          estimated_price:
            price > 0 ? `₹${price}` : "To be confirmed by seller",
          estimated_completion: `${turnaround} days`,
          notes: input.notes ?? null,
        },
        message:
          "Order created successfully. The seller will be notified and will contact the customer to arrange fabric pickup.",
      };
    }

    case "get_pricing": {
      const design = getDesignById(input.design_id as string);
      if (!design) {
        return {
          found: false,
          message: "Design not found. Check available designs.",
        };
      }
      return {
        found: true,
        design: design.name,
        price:
          design.price > 0
            ? `₹${design.price}`
            : "Price varies based on complexity",
        turnaround: `${design.turnaround_days} days`,
        note: design.note ?? "Starting price. Complex work may cost more.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
