"use client";

// Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
// Full Alerts Page: View and manage all material price alerts

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

type MaterialPriceAlert = {
  id: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  item_name: string;
  item_sku: string | null;
  category: string | null;
  previous_avg_unit_price: number;
  recent_avg_unit_price: number;
  percent_change: number;
  threshold_percent: number;
  status: "open" | "acknowledged" | "dismissed";
  created_at: string;
};

type FilterStatus = "all" | "open" | "acknowledged" | "dismissed";

export default function MaterialPriceAlertsPage() {
  const [alerts, setAlerts] = useState<MaterialPriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    loadAlerts();
  }, [statusFilter]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const url =
        statusFilter === "all"
          ? "/api/material/price-alerts"
          : `/api/material/price-alerts?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateAlertStatus = async (
    alertId: string,
    newStatus: "acknowledged" | "dismissed"
  ) => {
    try {
      const res = await fetch("/api/material/price-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, status: newStatus }),
      });

      if (res.ok) {
        // Reload alerts
        loadAlerts();
      } else {
        console.error("Failed to update alert status");
      }
    } catch (err) {
      console.error("Error updating alert:", err);
    }
  };

  const categories = [
    ...new Set(alerts.map((a) => a.category).filter(Boolean)),
  ] as string[];

  const filteredAlerts =
    categoryFilter === "all"
      ? alerts
      : alerts.filter((a) => a.category === categoryFilter);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">
          Material Price Alerts
        </h1>
        <p className="text-sm text-neutral-400">
          Catch price hikes before they eat job profit
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">Status:</span>
          <div className="flex gap-1">
            {(["all", "open", "acknowledged", "dismissed"] as FilterStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-1 text-xs border transition-colors ${
                    statusFilter === status
                      ? "border-red-500/60 bg-red-500/10 text-red-300"
                      : "border-white/10 bg-black/40 text-gray-300 hover:border-white/20"
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              )
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg px-3 py-1 text-xs border border-white/10 bg-black/40 text-gray-300"
            >
              <option value="all">All</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Alerts Table */}
      {loading ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
          Loading alerts…
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
          <div className="text-sm text-gray-400">
            {statusFilter === "all"
              ? "No price alerts found."
              : `No ${statusFilter} alerts found.`}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/40 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Material
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Supplier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Old Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    New Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    % Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-white">{alert.item_name}</div>
                      {alert.item_sku && (
                        <div className="text-xs text-gray-400">
                          SKU: {alert.item_sku}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {alert.supplier_name ||
                        `Supplier ${alert.supplier_id?.slice(0, 8)}...`}
                    </td>
                    <td className="px-4 py-3">
                      {alert.category && (
                        <Badge variant="outline" className="text-xs">
                          {alert.category}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      ${alert.previous_avg_unit_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      ${alert.recent_avg_unit_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="destructive"
                        className="text-xs font-semibold"
                      >
                        {alert.percent_change.toFixed(1)}% ↑
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          alert.status === "open"
                            ? "destructive"
                            : alert.status === "acknowledged"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {alert.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {alert.status === "open" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                updateAlertStatus(alert.id, "acknowledged")
                              }
                            >
                              Acknowledge
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                updateAlertStatus(alert.id, "dismissed")
                              }
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                        <div className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(alert.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}







































