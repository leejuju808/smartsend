// Block 20120 — Inbox Alerts Panel
"use client";

import { useEffect, useState } from "react";

type Convo = {
  id: string;
  homeowner_name?: string;
  homeowner_email?: string;
  unread_inbound_count?: number;
};

interface AlertsPayload {
  unread_conversations: Convo[];
  hot_waiting: Convo[];
  warm_waiting: Convo[];
}

export function InboxAlertsPanel() {
  const [alerts, setAlerts] = useState<AlertsPayload>({
    unread_conversations: [],
    hot_waiting: [],
    warm_waiting: [],
  });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/sla-alerts");
      if (!res.ok) {
        throw new Error("Failed to load alerts");
      }
      const json = await res.json();
      setAlerts(json);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unreadCount = alerts.unread_conversations.length;
  const hotCount = alerts.hot_waiting.length;
  const warmCount = alerts.warm_waiting.length;

  return (
    <div className="p-4 bg-white rounded-xl border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Attention Needed</h3>
        <button
          onClick={load}
          className="text-[11px] text-gray-500 underline hover:text-gray-700"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <AlertRow
          label="Unread homeowner replies"
          count={unreadCount}
          tone="primary"
        />
        <AlertRow
          label="Hot leads waiting > 4 hrs"
          count={hotCount}
          tone="danger"
        />
        <AlertRow
          label="Warm leads waiting > 24 hrs"
          count={warmCount}
          tone="warn"
        />
      </div>
    </div>
  );
}

function AlertRow({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "primary" | "danger" | "warn";
}) {
  const dotColor =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-blue-500";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-gray-600">{label}</span>
      </div>
      <span className="font-semibold text-gray-800">{count}</span>
    </div>
  );
}

















































