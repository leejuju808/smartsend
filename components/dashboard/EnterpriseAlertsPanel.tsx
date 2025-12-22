"use client";

// Block 254500 — SmartSend Enterprise Command Center v1
// Enterprise Alerts Panel Component
// Shows enterprise-level alerts and events

import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, Info, X, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type EnterpriseEvent = {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_name: string | null;
  event_type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  is_resolved: boolean;
  ai_recommendation: string | null;
  created_at: string;
};

export function EnterpriseAlertsPanel() {
  const [events, setEvents] = useState<EnterpriseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unresolved">("unresolved");

  useEffect(() => {
    fetch(`/api/enterprise/events?filter=${filter}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch events");
        return r.json();
      })
      .then((res) => {
        setEvents(res.events || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load events:", err);
        setLoading(false);
      });
  }, [filter]);

  const unresolvedEvents = events.filter((e) => !e.is_resolved);
  const criticalEvents = unresolvedEvents.filter((e) => e.severity === "critical");
  const warningEvents = unresolvedEvents.filter((e) => e.severity === "warning");

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        Loading alerts…
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Enterprise Alerts</h3>
          <p className="text-xs text-gray-400">
            {unresolvedEvents.length} unresolved alert{unresolvedEvents.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("unresolved")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "unresolved"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "bg-white/5 text-gray-400 border border-white/10"
            }`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "bg-white/5 text-gray-400 border border-white/10"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {criticalEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Critical Alerts ({criticalEvents.length})
          </div>
          {criticalEvents.map((event) => (
            <AlertCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {warningEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-400 mb-2">
            <AlertCircle className="w-4 h-4" />
            Warnings ({warningEvents.length})
          </div>
          {warningEvents.map((event) => (
            <AlertCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {unresolvedEvents.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No unresolved alerts</p>
        </div>
      )}

      {filter === "all" && events.filter((e) => e.is_resolved).length > 0 && (
        <div className="space-y-2 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-2">
            <Info className="w-4 h-4" />
            Resolved ({events.filter((e) => e.is_resolved).length})
          </div>
          {events
            .filter((e) => e.is_resolved)
            .map((event) => (
              <AlertCard key={event.id} event={event} />
            ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ event }: { event: EnterpriseEvent }) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const res = await fetch(`/api/enterprise/events/${event.id}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        // Refresh the list
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to resolve event:", err);
    } finally {
      setResolving(false);
    }
  };

  const severityColors = {
    critical: "bg-red-500/10 border-red-500/30 text-red-400",
    warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  };

  const severityIcons = {
    critical: AlertTriangle,
    warning: AlertCircle,
    info: Info,
  };

  const Icon = severityIcons[event.severity];

  return (
    <div
      className={`rounded-lg border p-4 ${
        event.is_resolved
          ? "bg-gray-500/5 border-gray-500/20 opacity-60"
          : severityColors[event.severity]
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-3 flex-1">
          <Icon className={`w-5 h-5 mt-0.5 ${event.is_resolved ? "text-gray-400" : ""}`} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-semibold ${event.is_resolved ? "text-gray-400" : ""}`}>
                {event.title}
              </h4>
              {event.branch_name && (
                <span className="text-xs px-2 py-0.5 bg-white/10 rounded">
                  {event.branch_name}
                </span>
              )}
            </div>
            <p className={`text-sm ${event.is_resolved ? "text-gray-500" : ""}`}>
              {event.message}
            </p>
            {event.ai_recommendation && !event.is_resolved && (
              <div className="mt-2 p-2 bg-white/5 rounded text-xs">
                <span className="font-semibold text-blue-400">AI Recommendation: </span>
                <span className="text-gray-300">{event.ai_recommendation}</span>
              </div>
            )}
            <div className="mt-2 text-xs text-gray-400">
              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>
        {!event.is_resolved && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="ml-4 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {resolving ? "Resolving..." : "Resolve"}
          </button>
        )}
      </div>
    </div>
  );
}






















