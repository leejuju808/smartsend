"use client";

import { useEffect, useState } from "react";
import { useBillingEventsRealtime } from "@/hooks/useBillingEventsRealtime";

export function BillingEventsFeed({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [events, setEvents] = useState<any[]>([]);

  // Load initial events
  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/billing/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, page: 1 }),
      });
      const json = await res.json();
      setEvents(json.events || []);
    };
    load();
  }, [workspaceId]);

  // Add realtime events to top of feed
  useBillingEventsRealtime((ev) => {
    // Only add events for this workspace
    if (ev.workspace_id === workspaceId) {
      setEvents((prev) => [
        { ...ev, level: mapLevel(ev.type) },
        ...prev,
      ]);
    }
  });

  function mapLevel(type: string) {
    if (type.includes("near_cap")) return "warning";
    if (type.includes("blocked") || type.includes("seat_over"))
      return "error";
    return "info";
  }

  if (events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No billing events yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((ev) => (
        <div
          key={ev.id}
          className={`border rounded p-3 ${
            ev.level === "error"
              ? "border-red-500 bg-red-50"
              : ev.level === "warning"
              ? "border-yellow-500 bg-yellow-50"
              : "border-muted bg-muted"
          }`}
        >
          <div className="font-medium">{formatType(ev.type)}</div>
          <div className="text-sm text-muted-foreground">{ev.detail}</div>
          <div className="text-xs mt-1">{formatTime(ev.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

function formatType(t: string) {
  return t
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString();
}








