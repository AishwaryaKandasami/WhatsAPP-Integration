"use client";

import { useState, useEffect } from "react";

interface MenuItem {
  id: string;
  item_key: string;
  name: string;
  description: string;
  price: number;
  meal_type: string;
  available: boolean;
}

interface MenuData {
  breakfast: MenuItem[];
  lunch: MenuItem[];
  dinner: MenuItem[];
}

export default function KitchenMenuPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [menu, setMenu] = useState<MenuData | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  // Try loading menu on mount (cookie might still be valid)
  useEffect(() => {
    tryLoadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryLoadMenu() {
    setMenuLoading(true);
    try {
      const res = await fetch("/api/kitchen/menu");
      if (res.ok) {
        const data = await res.json();
        setMenu(data.items);
        initToggles(data.items);
        setAuthenticated(true);
      }
    } catch {
      // Not authenticated — show PIN screen
    } finally {
      setMenuLoading(false);
    }
  }

  function initToggles(data: MenuData) {
    const t: Record<string, boolean> = {};
    for (const items of [data.breakfast, data.lunch, data.dinner]) {
      for (const item of items) {
        t[item.id] = item.available;
      }
    }
    setToggles(t);
  }

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
        await tryLoadMenu();
      } else {
        setPinError("Wrong PIN. Try again.");
      }
    } catch {
      setPinError("Connection error. Try again.");
    } finally {
      setPinLoading(false);
    }
  }

  function handleToggle(itemId: string) {
    setToggles((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    setSaveMessage("");
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");

    const items = Object.entries(toggles).map(([menu_item_id, available]) => ({
      menu_item_id,
      available,
    }));

    try {
      const res = await fetch("/api/kitchen/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        setSaveMessage("Menu updated!");
      } else {
        setSaveMessage("Failed to save. Try again.");
      }
    } catch {
      setSaveMessage("Connection error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // ─── PIN Screen ───────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">{String.fromCodePoint(0x1f373)}</div>
            <h1 className="text-xl font-bold text-gray-800">Kitchen Login</h1>
            <p className="text-gray-500 text-sm mt-1">
              Enter your PIN to manage today&apos;s menu
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

  // ─── Loading ──────────────────────────────────────────────────
  if (menuLoading || !menu) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <p className="text-gray-500">Loading menu...</p>
      </div>
    );
  }

  // ─── Menu Management ─────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const sections: { key: keyof MenuData; label: string; emoji: number }[] = [
    { key: "breakfast", label: "Breakfast", emoji: 0x2615 },
    { key: "lunch", label: "Lunch", emoji: 0x1f35a },
    { key: "dinner", label: "Dinner", emoji: 0x1f319 },
  ];

  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4 shadow sticky top-0 z-10">
        <h1 className="text-lg font-bold">
          {String.fromCodePoint(0x1f373)} Today&apos;s Menu
        </h1>
        <p className="text-orange-100 text-sm">{today}</p>
      </div>

      {/* Menu Sections */}
      <div className="p-4 space-y-4 pb-28">
        {sections.map(({ key, label, emoji }) => (
          <div key={key} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-orange-100 px-4 py-3 border-b border-orange-200">
              <h2 className="font-bold text-orange-800">
                {String.fromCodePoint(emoji)} {label}
              </h2>
            </div>

            <div className="divide-y divide-gray-100">
              {menu[key].map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex-1 mr-4">
                    <div className="font-medium text-gray-800 text-sm">
                      {item.name}
                    </div>
                    <div className="text-gray-500 text-xs">
                      Rs.{item.price}
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      toggles[item.id]
                        ? "bg-orange-500"
                        : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={toggles[item.id]}
                    aria-label={`Toggle ${item.name}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        toggles[item.id]
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}

              {menu[key].length === 0 && (
                <div className="px-4 py-3 text-gray-400 text-sm text-center">
                  No items in this category
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-600 text-white rounded-xl py-3 font-semibold text-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saveMessage && (
          <p
            className={`text-center text-sm mt-2 ${
              saveMessage.includes("updated")
                ? "text-green-600"
                : "text-red-500"
            }`}
          >
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  );
}
