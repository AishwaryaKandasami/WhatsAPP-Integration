import catalogData from "../../data/catalog.json";

export interface CatalogItem {
  id: string;
  name: string;
  name_tamil: string;
  description: string;
  description_tamil: string;
  price: number;
  turnaround_days: number;
  suitable_for: string[];
  available: boolean;
  note?: string;
}

const catalog: CatalogItem[] = catalogData as CatalogItem[];

export function getAllDesigns(): CatalogItem[] {
  return catalog.filter((item) => item.available);
}

export function getDesignById(id: string): CatalogItem | undefined {
  return catalog.find((item) => item.id === id);
}

export function searchDesigns(query: string): CatalogItem[] {
  const q = query.toLowerCase();
  return catalog.filter(
    (item) =>
      item.available &&
      (item.name.toLowerCase().includes(q) ||
        item.name_tamil.includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.description_tamil.includes(q) ||
        item.id.includes(q) ||
        item.suitable_for.some((s) => s.includes(q)))
  );
}

/**
 * Format catalog as text for the AI system prompt
 */
export function catalogForPrompt(): string {
  return catalog
    .filter((item) => item.available)
    .map((item) => {
      let line = `- ${item.name} (${item.name_tamil}): ${item.description}`;
      if (item.price > 0) {
        line += ` Price: ₹${item.price}.`;
      } else if (item.note) {
        line += ` ${item.note}`;
      }
      line += ` Turnaround: ${item.turnaround_days} days.`;
      line += ` Suitable for: ${item.suitable_for.join(", ")}.`;
      return line;
    })
    .join("\n");
}
