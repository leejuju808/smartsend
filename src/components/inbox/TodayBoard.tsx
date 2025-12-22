// Block 20190 — Inbox Today Board Component
// Three-column "Today" strip showing new leads, follow-ups, and hot leads needing attention

"use client";

import { useEffect, useState } from "react";

type Convo = {
  id: string;
  homeowner_name?: string | null;
  homeowner_email?: string | null;
  homeowner_phone?: string | null;
  property_address?: string | null;
  lead_stage?: string | null;
  engagement_level?: string | null;
  engagement_score?: number | null;
  estimated_job_value?: number | null;
  next_action_at?: string | null;
  created_at?: string | null;
  last_contact_at?: string | null;
};

interface TodayBoardProps {
  myOnly?: boolean; // show only my leads or all
  onSelectConversation?: (convo: Convo) => void;
}

export function TodayBoard({
  myOnly = false,
  onSelectConversation,
}: TodayBoardProps) {
  const [data, setData] = useState<{
    new_leads_today: Convo[];
    followups_due_today: Convo[];
    hot_attention: Convo[];
  }>({
    new_leads_today: [],
    followups_due_today: [],
    hot_attention: [],
  });

  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (myOnly) params.set("my_only", "true");
      const res = await fetch(`/api/inbox/today-board?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load today board");
      }
      const json = await res.json();
      setData({
        new_leads_today: json.new_leads_today ?? [],
        followups_due_today: json.followups_due_today ?? [],
        hot_attention: json.hot_attention ?? [],
      });
    } catch (error) {
      console.error("Failed to load today board:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOnly]);

  return (
    <div className="p-4 bg-white rounded-xl border space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Today&apos;s Work
          </h3>
          <p className="text-[11px] text-gray-500">
            New leads, follow-ups, and hot homeowners that need attention today.
          </p>
        </div>
        <button
          onClick={load}
          className="text-[11px] text-gray-500 underline hover:text-gray-700"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <TodayColumn
          title="New leads today"
          tone="primary"
          items={data.new_leads_today}
          emptyLabel="No new leads yet today."
          onSelect={onSelectConversation}
        />
        <TodayColumn
          title="Follow-ups due"
          tone="warn"
          items={data.followups_due_today}
          emptyLabel="No follow-ups due today."
          showNextAction
          onSelect={onSelectConversation}
        />
        <TodayColumn
          title="Hot leads (waiting)"
          tone="danger"
          items={data.hot_attention}
          emptyLabel="No hot leads overdue right now."
          onSelect={onSelectConversation}
        />
      </div>
    </div>
  );
}

function TodayColumn({
  title,
  tone,
  items,
  emptyLabel,
  showNextAction,
  onSelect,
}: {
  title: string;
  tone: "primary" | "warn" | "danger";
  items: Convo[];
  emptyLabel: string;
  showNextAction?: boolean;
  onSelect?: (c: Convo) => void;
}) {
  const accent =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-blue-500";

  return (
    <div className="border rounded-xl p-3 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accent}`} />
          <span className="font-semibold text-gray-800 text-xs">{title}</span>
        </div>
        <span className="text-[11px] text-gray-500">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-1 overflow-auto">
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect && onSelect(c)}
              className="w-full text-left px-2 py-1 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
            >
              <p className="font-semibold text-gray-800 truncate text-xs">
                {c.homeowner_name || c.homeowner_email || "Homeowner"}
              </p>
              {c.property_address && (
                <p className="text-[11px] text-gray-500 truncate">
                  {c.property_address}
                </p>
              )}
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-[10px] text-gray-400">
                  Stage: {c.lead_stage || "new"} ·{" "}
                  {c.engagement_level
                    ? c.engagement_level.toUpperCase()
                    : "UNRANKED"}
                </p>
                {typeof c.estimated_job_value === "number" && (
                  <p className="text-[10px] text-gray-500">
                    Est: $
                    {Number(c.estimated_job_value).toLocaleString()}
                  </p>
                )}
              </div>
              {showNextAction && c.next_action_at && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Next:{" "}
                  {new Date(c.next_action_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

















































