// Block 20330 — Next Best Action Card

"use client";

import { useEffect, useState } from "react";

type NextBestAction = {
  key: string;
  label: string;
  description: string;
  priority: "low" | "medium" | "high";
  suggested_channel: "call" | "email" | "sms" | "internal";
  due_in_days: number;
};

interface NextBestActionCardProps {
  conversationId: string;
}

export function NextBestActionCard({
  conversationId,
}: NextBestActionCardProps) {
  const [actions, setActions] = useState<NextBestAction[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/next-best-actions?conversation_id=${conversationId}`
      );
      const json = await res.json();
      setActions(json.actions ?? []);
    } catch (err) {
      console.error("Next best actions load error", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  if (!loading && actions.length === 0) {
    return null;
  }

  const primary = actions[0];
  const secondary = actions.slice(1);

  function priorityColor(p: string) {
    switch (p) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-amber-600";
      default:
        return "text-slate-500";
    }
  }

  function channelLabel(c: string) {
    switch (c) {
      case "call":
        return "Call";
      case "email":
        return "Email";
      case "sms":
        return "Text";
      case "internal":
        return "Internal note";
      default:
        return "Action";
    }
  }

  function dueLabel(days: number) {
    if (days <= 0) return "Today";
    if (days === 1) return "Within 1 day";
    return `Within ${days} days`;
  }

  return (
    <div className="mt-2 mb-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-800">
          Next best action
        </p>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-gray-400 underline"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {primary && (
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-900">
              {primary.label}
            </p>
            <span
              className={`text-[10px] font-semibold ${priorityColor(
                primary.priority
              )}`}
            >
              {channelLabel(primary.suggested_channel)} ·{" "}
              {dueLabel(primary.due_in_days)}
            </span>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {primary.description}
          </p>
        </div>
      )}

      {secondary.length > 0 && (
        <div className="border-t pt-2 mt-1 space-y-1.5">
          {secondary.map((a) => (
            <div key={a.key} className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-gray-700">{a.label}</p>
              <span className="text-[10px] text-gray-400">
                {channelLabel(a.suggested_channel)} · {dueLabel(a.due_in_days)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

















































