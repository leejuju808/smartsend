// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// Margin Alerts Component (Profit Protection)

"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MarginAlert {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  current_margin: number;
  threshold_margin?: number;
  current_profit: number;
  message: string;
  suggestion?: string;
  acknowledged: boolean;
  resolved: boolean;
}

const SEVERITY_COLORS = {
  low: "text-blue-400 bg-blue-900/30",
  medium: "text-amber-400 bg-amber-900/30",
  high: "text-orange-400 bg-orange-900/30",
  critical: "text-red-400 bg-red-900/30",
};

export function MarginAlerts({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<{ alerts: MarginAlert[] }>(
    `/api/jobs/${jobId}/margin-alerts`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const handleAcknowledge = async (alertId: string) => {
    const res = await fetch(`/api/jobs/${jobId}/margin-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, action: "acknowledge" }),
    });
    if (res.ok) mutate();
  };

  const handleResolve = async (alertId: string) => {
    const res = await fetch(`/api/jobs/${jobId}/margin-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, action: "resolve" }),
    });
    if (res.ok) mutate();
  };

  if (error) {
    return null; // Silently fail
  }

  const alerts = data?.alerts || [];

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-200">Margin Alerts</h3>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-lg border ${
            alert.severity === "critical"
              ? "border-red-800 bg-red-950/20"
              : alert.severity === "high"
              ? "border-orange-800 bg-orange-950/20"
              : "border-amber-800 bg-amber-950/20"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded ${SEVERITY_COLORS[alert.severity]}`}>
                  {alert.severity.toUpperCase()}
                </span>
                <span className="text-xs text-zinc-400">
                  {alert.alert_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </div>
              <div className="text-sm text-zinc-200 mb-1">{alert.message}</div>
              {alert.suggestion && (
                <div className="text-xs text-zinc-400 italic">{alert.suggestion}</div>
              )}
              <div className="text-xs text-zinc-500 mt-1">
                Margin: {alert.current_margin?.toFixed(1)}% • Profit: ${alert.current_profit?.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-1 ml-2">
              {!alert.acknowledged && (
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                >
                  Acknowledge
                </button>
              )}
              {!alert.resolved && (
                <button
                  onClick={() => handleResolve(alert.id)}
                  className="text-xs px-2 py-1 bg-blue-900/50 hover:bg-blue-900/70 rounded text-blue-300"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}




































