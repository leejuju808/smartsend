"use client";

// Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
// Component: Shows material price history for a specific supplier

import { useEffect, useState } from "react";
import { format } from "date-fns";

type PriceHistoryEntry = {
  month: string;
  item_name: string;
  item_sku: string | null;
  category: string | null;
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  order_count: number;
  total_quantity: number;
};

type SupplierPriceHistoryProps = {
  supplierId: string;
  itemName?: string; // Optional: filter by specific item
  limit?: number; // Optional: limit number of months
};

export function SupplierPriceHistory({
  supplierId,
  itemName,
  limit = 12,
}: SupplierPriceHistoryProps) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [supplierId, itemName]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      // Get workspace_id
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) return;

      // Query price history view
      let query = supabase
        .from("material_price_history")
        .select("*")
        .eq("workspace_id", membership.workspace_id)
        .eq("supplier_id", supplierId)
        .order("month", { ascending: false })
        .limit(limit);

      if (itemName) {
        query = query.eq("item_name", itemName);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Failed to load price history:", error);
      } else {
        setHistory(data || []);
      }
    } catch (err) {
      console.error("Error loading price history:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400">Loading price history…</div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-sm text-gray-400">
        No price history available for this supplier.
      </div>
    );
  }

  // Group by item_name for display
  const items = [...new Set(history.map((h) => h.item_name))];

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const itemHistory = history
          .filter((h) => h.item_name === item)
          .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

        return (
          <div
            key={item}
            className="rounded-lg border border-white/10 bg-black/40 p-4"
          >
            <div className="mb-3">
              <div className="text-sm font-medium text-white">{item}</div>
              {itemHistory[0]?.category && (
                <div className="text-xs text-gray-400">
                  {itemHistory[0].category}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="text-left py-2 text-gray-300">Month</th>
                    <th className="text-right py-2 text-gray-300">Avg Price</th>
                    <th className="text-right py-2 text-gray-300">Range</th>
                    <th className="text-right py-2 text-gray-300">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {itemHistory.map((entry) => {
                    const monthDate = new Date(entry.month);
                    const prevEntry = itemHistory.find(
                      (e) =>
                        new Date(e.month).getTime() < monthDate.getTime()
                    );
                    const priceChange =
                      prevEntry &&
                      entry.avg_unit_price - prevEntry.avg_unit_price;
                    const percentChange =
                      prevEntry && prevEntry.avg_unit_price > 0
                        ? ((entry.avg_unit_price - prevEntry.avg_unit_price) /
                            prevEntry.avg_unit_price) *
                          100
                        : 0;

                    return (
                      <tr key={entry.month} className="hover:bg-white/5">
                        <td className="py-2 text-gray-300">
                          {format(monthDate, "MMM yyyy")}
                        </td>
                        <td className="py-2 text-right text-white font-medium">
                          ${entry.avg_unit_price.toFixed(2)}
                          {priceChange && priceChange > 0 && (
                            <span className="ml-2 text-xs text-red-400">
                              ↑ {percentChange.toFixed(1)}%
                            </span>
                          )}
                          {priceChange && priceChange < 0 && (
                            <span className="ml-2 text-xs text-green-400">
                              ↓ {Math.abs(percentChange).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right text-gray-400">
                          ${entry.min_unit_price.toFixed(2)} - $
                          {entry.max_unit_price.toFixed(2)}
                        </td>
                        <td className="py-2 text-right text-gray-400">
                          {entry.order_count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

