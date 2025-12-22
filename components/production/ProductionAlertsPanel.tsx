"use client";

// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Production Alerts Panel Component for Owner Command Center

import { useEffect, useState } from "react";
import { AlertTriangle, X, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface ProductionAlert {
  id: string;
  workspace_id: string;
  job_id: string | null;
  crew_id: string | null;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  is_read: boolean;
  job?: {
    id: string;
    title: string;
    homeowner_name: string | null;
    address: string | null;
  } | null;
  crew?: {
    id: string;
    name: string;
  } | null;
}

export function ProductionAlertsPanel() {
  const [alerts, setAlerts] = useState<ProductionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/production/alerts?unread_only=true")
      .then((r) => r.json())
      .then((res) => {
        setAlerts(res.alerts || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load production alerts:", err);
        setLoading(false);
      });
  }, []);

  const markAsRead = async (alertId: string) => {
    try {
      await fetch("/api/production/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, is_read: true }),
      });

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a))
      );
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-400 bg-red-600/10 border-red-600/20";
      case "warning":
        return "text-yellow-400 bg-yellow-600/10 border-yellow-600/20";
      case "info":
        return "text-blue-400 bg-blue-600/10 border-blue-600/20";
      default:
        return "text-zinc-400 bg-zinc-600/10 border-zinc-600/20";
    }
  };

  const getTypeIcon = (type: string) => {
    return <AlertTriangle className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading production alerts…</p>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Production Alerts
          </h3>
        </div>
        <p className="text-xs text-zinc-400">
          No active alerts. All jobs are on track.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Production Alerts
        </h3>
        <span className="text-xs text-zinc-400">
          {alerts.filter((a) => !a.is_read).length} unread
        </span>
      </div>

      <div className="space-y-2">
        {alerts.slice(0, 10).map((alert) => (
          <div
            key={alert.id}
            className={`rounded-lg border p-3 space-y-2 ${getSeverityColor(
              alert.severity
            )}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1">
                {getTypeIcon(alert.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold capitalize">
                      {alert.type.replace("_", " ")}
                    </span>
                    {alert.job && (
                      <Link
                        href={`/jobs/${alert.job.id}`}
                        className="text-xs text-blue-400 hover:text-blue-300 truncate"
                      >
                        {alert.job.title}
                      </Link>
                    )}
                  </div>
                  <p className="text-xs opacity-90">{alert.message}</p>
                  {alert.crew && (
                    <p className="text-xs opacity-70 mt-1">
                      Crew: {alert.crew.name}
                    </p>
                  )}
                  <p className="text-xs opacity-60 mt-1">
                    {formatDistanceToNow(new Date(alert.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              {!alert.is_read && (
                <button
                  onClick={() => markAsRead(alert.id)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  title="Mark as read"
                >
                  <Check className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 10 && (
        <div className="pt-2 border-t border-zinc-800">
          <Link
            href="/production/alerts"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            View all {alerts.length} alerts →
          </Link>
        </div>
      )}
    </div>
  );
}







































