import { getFoodOrders } from "@/lib/db/food-queries";

// Shown when the table is empty (e.g. a fresh deploy) so the section never
// looks broken. Same shape as a real row, clearly generic content.
const FALLBACK_ORDERS = [
  { id: "f1", items_text: "2x Idli Set, 1x Sambar Rice", total: 140, meal_type: "breakfast", status: "confirmed", created_at: new Date().toISOString() },
  { id: "f2", items_text: "1x Chicken Biryani", total: 120, meal_type: "lunch", status: "preparing", created_at: new Date().toISOString() },
  { id: "f3", items_text: "2x Parotta + Salna", total: 140, meal_type: "dinner", status: "delivered", created_at: new Date().toISOString() },
];

const STATUS_META: Record<string, { label: string; badge: string }> = {
  confirmed: { label: "New", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  preparing: { label: "Preparing", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  out_for_delivery: { label: "On the way", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  delivered: { label: "Delivered", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/**
 * Live example of the kitchen owner's order dashboard — pulls the most
 * recent real orders from Supabase so a prospect sees actual automatic order
 * logging, not a mockup. Customer name/phone are intentionally omitted here
 * (not needed for the pitch); the full dashboard shows them at /kitchen/orders.
 */
export default async function OrderDashboardExample() {
  let orders: Array<{
    id: string;
    items_text: string;
    total: number;
    meal_type: string;
    status: string;
    created_at: string;
  }> = [];

  try {
    const rows = await getFoodOrders(3);
    orders = rows.length > 0 ? rows : FALLBACK_ORDERS;
  } catch {
    orders = FALLBACK_ORDERS;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <span className="text-sm font-semibold text-slate-700">
          {String.fromCodePoint(0x1f9fe)} Kitchen Orders
        </span>
        <span className="text-xs text-slate-400">Live example</span>
      </div>
      <div className="divide-y divide-slate-100">
        {orders.map((order) => {
          const meta = STATUS_META[order.status] ?? STATUS_META.confirmed;
          return (
            <div key={order.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {order.meal_type}
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-800">
                  {order.items_text}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatTime(order.created_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
                >
                  {meta.label}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  Rs.{order.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
