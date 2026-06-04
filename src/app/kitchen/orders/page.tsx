"use client";

import { useState, useEffect, useCallback } from "react";

interface FoodOrder {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  items_json: Array<{ name: string; qty: number; price: number }>;
  items_text: string;
  total: number;
  delivery_type: string;
  delivery_address: string | null;
  meal_type: string;
  notes: string | null;
  status: string;
  created_at: string;
}

type OrderFilter = "active" | "delivered" | "cancelled" | "all";

const STATUS_META: Record<string, { label: string; badge: string }> = {
  confirmed: {
    label: "New",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  preparing: {
    label: "Preparing",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  out_for_delivery: {
    label: "On the way",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
  },
  delivered: {
    label: "Delivered",
    badge: "bg-green-100 text-green-800 border-green-200",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-gray-200 text-gray-600 border-gray-300",
  },
};

const NEXT_LABEL: Record<string, string> = {
  preparing: "Start cooking",
  out_for_delivery: "Out for delivery",
  delivered: "Mark delivered",
};

function nextStatus(order: FoodOrder): string | null {
  const flow =
    order.delivery_type === "pickup"
      ? ["confirmed", "preparing", "delivered"]
      : ["confirmed", "preparing", "out_for_delivery", "delivered"];
  const idx = flow.indexOf(order.status);
  if (idx === -1 || idx >= flow.length - 1) return null;
  return flow[idx + 1];
}

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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

export default function KitchenOrdersPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/kitchen/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
        setAuthenticated(true);
        setLastUpdated(new Date());
      } else if (res.status === 401) {
        setAuthenticated(false);
      }
    } catch {
      // Network blip — keep showing whatever we already have
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Try loading on mount (cookie might still be valid). Inlined as an async
  // IIFE so that no setState runs synchronously inside the effect.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/kitchen/orders");
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setOrders(data.orders ?? []);
          setAuthenticated(true);
          setLastUpdated(new Date());
        } else if (res.status === 401) {
          setAuthenticated(false);
        }
      } catch {
        // Not authenticated yet, or a network blip — PIN screen stays
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Auto-refresh every 20s so new orders appear without a manual reload
  useEffect(() => {
    if (!authenticated) return;
    const id = setInterval(() => loadOrders(true), 20000);
    return () => clearInterval(id);
  }, [authenticated, loadOrders]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;

    setPinLoading(true);
    setPinError("");

    try {
      const res = await fetch("/api/kitchen/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });

      if (res.ok) {
        setAuthenticated(true);
        await loadOrders();
      } else if (res.status === 500) {
        setPinError(
          "Server has no PIN configured (KITCHEN_PIN missing). On Vercel: add it, then redeploy."
        );
      } else if (res.status === 404) {
        setPinError("Login endpoint not found — this build isn't deployed here yet.");
      } else {
        setPinError("Wrong PIN. Try again.");
      }
    } catch {
      setPinError("Connection error. Try again.");
    } finally {
      setPinLoading(false);
    }
  }

  async function updateStatus(orderId: string, status: string) {
    setUpdatingId(orderId);
    // Optimistic update so the UI feels instant
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
    try {
      const res = await fetch("/api/kitchen/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });
      if (!res.ok) await loadOrders();
    } catch {
      await loadOrders();
    } finally {
      setUpdatingId(null);
    }
  }

  function handleCancel(orderId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Cancel this order? You can reopen it afterwards if needed.")
    ) {
      return;
    }
    updateStatus(orderId, "cancelled");
  }

  // ─── PIN Screen ───────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">{String.fromCodePoint(0x1f9fe)}</div>
            <h1 className="text-xl font-bold text-gray-800">Kitchen Orders</h1>
            <p className="text-gray-500 text-sm mt-1">
              Enter your PIN to view today&apos;s orders
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              className="w-full text-center text-2xl tracking-widest border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
              autoFocus
            />

            {pinError && (
              <p className="text-red-500 text-sm text-center">{pinError}</p>
            )}

            <button
              type="submit"
              disabled={pinLoading || !pin.trim()}
              className="w-full bg-orange-600 text-white rounded-xl py-3 font-semibold text-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pinLoading ? "Checking..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Orders Screen ────────────────────────────────────────────
  const counts = {
    active: orders.filter((o) =>
      ["confirmed", "preparing", "out_for_delivery"].includes(o.status)
    ).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    all: orders.length,
  };

  const visible = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active")
      return ["confirmed", "preparing", "out_for_delivery"].includes(o.status);
    return o.status === filter;
  });

  const tabs: { key: OrderFilter; label: string; count: number }[] = [
    { key: "active", label: "Active", count: counts.active },
    { key: "delivered", label: "Delivered", count: counts.delivered },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4 shadow sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <a
            href="/kitchen/menu"
            className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg px-3 py-2"
          >
            {String.fromCodePoint(0x2190)} Menu
          </a>
          <h1 className="text-lg font-bold">Orders</h1>
          <button
            onClick={() => loadOrders()}
            disabled={loading}
            className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg px-3 py-2 disabled:opacity-60"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
        {lastUpdated && (
          <p className="text-orange-100 text-xs mt-1 text-center">
            Updated{" "}
            {lastUpdated.toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}{" "}
            · auto-refreshes
          </p>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pt-3 pb-1 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border ${
              filter === t.key
                ? "bg-orange-600 text-white border-orange-600"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="p-3 space-y-3 pb-10">
        {visible.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            {filter === "active"
              ? "No active orders right now."
              : "No orders to show."}
          </div>
        )}

        {visible.map((order) => {
          const meta = STATUS_META[order.status] ?? STATUS_META.confirmed;
          const next = nextStatus(order);
          const isTerminal =
            order.status === "delivered" || order.status === "cancelled";
          const waLink = `https://wa.me/${order.customer_phone.replace(/\D/g, "")}`;
          return (
            <div
              key={order.id}
              className={`bg-white rounded-xl shadow-sm overflow-hidden ${
                order.status === "cancelled" ? "opacity-60" : ""
              }`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between px-4 pt-3">
                <div>
                  <div className="text-xs text-gray-400 font-mono">
                    #{order.id.slice(0, 6)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(order.created_at)}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}
                >
                  {meta.label}
                </span>
              </div>

              {/* Meal + items */}
              <div className="px-4 py-2">
                <div className="text-xs uppercase tracking-wide text-orange-500 font-semibold">
                  {order.meal_type}
                </div>
                <div className="text-gray-800 font-medium text-sm mt-0.5">
                  {order.items_text}
                </div>
                <div className="text-gray-900 font-bold mt-1">
                  Total: Rs.{order.total}
                </div>
              </div>

              {/* Customer + delivery */}
              <div className="px-4 pb-2 text-sm space-y-1 border-t border-gray-100 pt-2">
                <div className="text-gray-700">
                  {order.customer_name ? `${order.customer_name} · ` : ""}
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-600 font-medium underline"
                  >
                    {formatPhone(order.customer_phone)}
                  </a>
                </div>
                <div className="text-gray-700">
                  {order.delivery_type === "delivery" ? (
                    <span>
                      <span className="font-medium">Delivery:</span>{" "}
                      {order.delivery_address || "(no address given)"}
                    </span>
                  ) : (
                    <span className="font-medium">Pickup</span>
                  )}
                </div>
                {order.notes && (
                  <div className="text-gray-600">
                    <span className="font-medium">Note:</span> {order.notes}
                  </div>
                )}
              </div>

              {/* Actions */}
              {!isTerminal && (
                <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                  {next && (
                    <button
                      onClick={() => updateStatus(order.id, next)}
                      disabled={updatingId === order.id}
                      className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
                    >
                      {NEXT_LABEL[next] ?? "Advance"}
                    </button>
                  )}
                  <button
                    onClick={() => handleCancel(order.id)}
                    disabled={updatingId === order.id}
                    className="shrink-0 border border-red-300 text-red-600 rounded-lg py-2 px-3 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {order.status === "cancelled" && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <button
                    onClick={() => updateStatus(order.id, "confirmed")}
                    disabled={updatingId === order.id}
                    className="text-sm text-orange-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Reopen order
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
