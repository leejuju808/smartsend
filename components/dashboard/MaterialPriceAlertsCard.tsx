"use client";

// Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
// Dashboard Card Component: Shows open price alerts

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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

export function MaterialPriceAlertsCard() {
  const [alerts, setAlerts] = useState<MaterialPriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/material/price-alerts")
      .then((r) => r.json())
      .then((res) => {
        setAlerts(res.alerts || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load price alerts:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Loading price alerts…
      </div>
    );
  }

  const openAlerts = alerts.filter((a) => a.status === "open");

  return (
    <div className="rounded-xl bg-gradient-to-r from-red-500/20 via-red-400/10 to-transparent border border-red-500/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-red-300 tracking-wide">
            Material Price Alerts
          </div>
          <div className="text-[11px] text-gray-300">
            Catch price hikes before they eat job profit
          </div>
        </div>
        <Badge
          variant={openAlerts.length > 0 ? "destructive" : "outline"}
          className="text-xs"
        >
          {openAlerts.length > 0
            ? `${openAlerts.length} open`
            : "No spikes"}
        </Badge>
      </div>

      {openAlerts.length === 0 ? (
        <div className="text-[11px] text-gray-400 py-2">
          No price spikes detected. All material costs are stable.
        </div>
      ) : (
        <div className="space-y-2">
          {openAlerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {alert.item_name}
                </span>
                <span className="text-xs font-semibold text-red-400">
                  {alert.percent_change.toFixed(1)}% ↑
                </span>
              </div>
              <div className="text-[11px] text-gray-400">
                {alert.category || "Material"} •{" "}
                {alert.supplier_name || `Supplier ${alert.supplier_id?.slice(0, 6)}...`}
              </div>
              <div className="text-[11px] text-gray-300">
                ${alert.previous_avg_unit_price.toFixed(2)} → $
                {alert.recent_avg_unit_price.toFixed(2)} per{" "}
                {alert.category || "unit"}
              </div>
            </div>
          ))}
        </div>
      )}

      {openAlerts.length > 0 && (
        <div className="flex justify-end pt-2">
          <Link href="/dashboard/material/alerts">
            <Button variant="outline" size="sm" className="text-xs">
              View all alerts
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}







































