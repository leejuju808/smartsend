// Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
// Variance Alerts Panel Component for Dashboard
// Shows top open variance alerts

"use client";

import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VarianceAlert {
  id: string;
  job_id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  job?: {
    id: string;
    title: string;
    homeowner_name?: string;
    homeowner_email?: string;
  };
}

interface VarianceAlertsData {
  alerts: VarianceAlert[];
}

export function VarianceAlertsPanel() {
  const { data, error } = useSWR<VarianceAlertsData>(
    "/api/dashboard/variance-alerts",
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
    }
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error loading variance alerts
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading variance alerts…</p>
      </div>
    );
  }

  const { alerts } = data;

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Variance Alerts
          </h3>
        </div>
        <p className="text-xs text-zinc-400">
          No open alerts. All jobs are on track.
        </p>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-400 bg-red-600/10 border-red-600/20";
      case "warning":
        return "text-yellow-400 bg-yellow-600/10 border-yellow-600/20";
      default:
        return "text-blue-400 bg-blue-600/10 border-blue-600/20";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "material_overrun":
        return "Material Overrun";
      case "labor_overrun":
        return "Labor Overrun";
      case "margin_risk":
        return "Margin Risk";
      case "overall_risk":
        return "Critical Risk";
      default:
        return type;
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Variance Alerts
        </h3>
        <Link
          href="/jobs"
          className="text-xs text-zinc-400 hover:text-zinc-300"
        >
          View All
        </Link>
      </div>

      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert) => (
          <Link
            key={alert.id}
            href={`/jobs/${alert.job_id}`}
            className="block p-3 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 ${
                  alert.severity === "critical"
                    ? "text-red-400"
                    : alert.severity === "warning"
                    ? "text-yellow-400"
                    : "text-blue-400"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getSeverityColor(
                      alert.severity
                    )}`}
                  >
                    {getTypeLabel(alert.type)}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mb-1">
                  {alert.job?.title || alert.job?.homeowner_name || "Unknown Job"}
                </p>
                <p className="text-[11px] text-zinc-500">{alert.message}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {alerts.length > 3 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <Link
            href="/jobs"
            className="text-xs text-zinc-400 hover:text-zinc-300"
          >
            +{alerts.length - 3} more alerts
          </Link>
        </div>
      )}
    </div>
  );
}







































