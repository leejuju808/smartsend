"use client";

// Block 246000 — Issue Management Panel
// Centralized feed of: crew issues, customer complaints, material discrepancies, safety flags, production delays

import { AlertCircle, X, CheckCircle, Clock } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  metadata: any;
  is_resolved: boolean;
  created_at: string;
  job_id: string | null;
  crew_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
  } | null;
  crews?: {
    id: string;
    name: string;
  } | null;
}

interface IssueManagementPanelProps {
  alerts: Alert[];
  onIssueResolved: () => void;
}

export function IssueManagementPanel({ alerts, onIssueResolved }: IssueManagementPanelProps) {
  const [resolving, setResolving] = useState<string | null>(null);
  const activeAlerts = alerts.filter(a => !a.is_resolved);

  const resolveIssue = async (alertId: string) => {
    setResolving(alertId);
    try {
      // This would call an API to resolve the alert
      // For now, we'll just log an event
      await fetch("/api/production/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "issue_resolved",
          details: { alert_id: alertId },
        }),
      });

      onIssueResolved();
    } catch (error) {
      console.error("Failed to resolve issue:", error);
    } finally {
      setResolving(null);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 border-red-500/40 text-red-400";
      case "warning":
        return "bg-yellow-500/20 border-yellow-500/40 text-yellow-400";
      default:
        return "bg-blue-500/20 border-blue-500/40 text-blue-400";
    }
  };

  const getTypeLabel = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Issue Management</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {activeAlerts.length} open issues
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {activeAlerts.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
            <div>No active issues</div>
            <div className="text-xs mt-1">All systems operational</div>
          </div>
        ) : (
          activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border p-3 ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase">
                      {getTypeLabel(alert.type)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-black/20">
                      {alert.severity}
                    </span>
                  </div>

                  {alert.jobs && (
                    <Link href={`/production/jobs/${alert.jobs.id}`}>
                      <div className="text-sm font-medium text-white hover:text-blue-400 mb-1">
                        {alert.jobs.title || alert.jobs.address}
                      </div>
                    </Link>
                  )}

                  {alert.crews && (
                    <div className="text-xs text-zinc-300 mb-1">
                      Crew: {alert.crews.name}
                    </div>
                  )}

                  <div className="text-sm text-zinc-200 mb-2">{alert.message}</div>

                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Clock className="h-3 w-3" />
                    <span>
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => resolveIssue(alert.id)}
                  disabled={resolving === alert.id}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
                  title="Resolve issue"
                >
                  {resolving === alert.id ? (
                    <Clock className="h-4 w-4 text-zinc-400 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

























