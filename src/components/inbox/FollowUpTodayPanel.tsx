// Block 20060 — Follow-Up Today Panel
// Displays overdue, today, and upcoming follow-ups in a clean "call sheet" format

"use client";

import { useEffect, useState } from "react";

type Convo = {
  id: string;
  homeowner_name?: string;
  homeowner_email?: string;
  engagement_level?: string;
  engagement_score?: number;
  next_action_at?: string;
  lead_stage?: string;
};

interface FollowUpBuckets {
  overdue: Convo[];
  today: Convo[];
  upcoming: Convo[];
}

export function FollowUpTodayPanel() {
  const [data, setData] = useState<FollowUpBuckets>({
    overdue: [],
    today: [],
    upcoming: [],
  });
  const [loading, setLoading] = useState(false);

  async function loadFollowUps() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/followups");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Failed to load follow-ups:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFollowUps();
  }, []);

  function formatTime(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const totalDueNow = data.overdue.length + data.today.length;

  return (
    <div className="p-4 bg-white rounded-xl border space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Today&apos;s Follow-Ups</h3>
        {loading ? (
          <span className="text-xs text-gray-400">Refreshing…</span>
        ) : (
          <button
            onClick={loadFollowUps}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Refresh
          </button>
        )}
      </div>

      <div className="flex gap-3 text-sm">
        <div className="flex-1 p-3 rounded-lg bg-red-50 border border-red-100">
          <p className="text-xs text-red-500 uppercase tracking-wide">Overdue</p>
          <p className="text-2xl font-semibold text-red-600">{data.overdue.length}</p>
        </div>

        <div className="flex-1 p-3 rounded-lg bg-amber-50 border border-amber-100">
          <p className="text-xs text-amber-500 uppercase tracking-wide">Due Today</p>
          <p className="text-2xl font-semibold text-amber-600">{data.today.length}</p>
        </div>

        <div className="flex-1 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
          <p className="text-xs text-emerald-500 uppercase tracking-wide">Next 7 Days</p>
          <p className="text-2xl font-semibold text-emerald-600">{data.upcoming.length}</p>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {totalDueNow === 0 && (
          <p className="text-xs text-gray-500">
            No overdue or today follow-ups. You&apos;re caught up. 🔥
          </p>
        )}

        {data.overdue.length > 0 && (
          <BucketList title="Overdue" items={data.overdue} tone="overdue" />
        )}

        {data.today.length > 0 && (
          <BucketList title="Due Today" items={data.today} tone="today" />
        )}

        {data.upcoming.length > 0 && (
          <BucketList title="Upcoming (Next 7 Days)" items={data.upcoming} />
        )}
      </div>
    </div>
  );
}

function BucketList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Convo[];
  tone?: "overdue" | "today";
}) {
  const toneClasses =
    tone === "overdue"
      ? "border-red-100 hover:border-red-300"
      : tone === "today"
      ? "border-amber-100 hover:border-amber-300"
      : "border-gray-200 hover:border-gray-400";

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>
      <div className="space-y-1 max-h-56 overflow-auto pr-1">
        {items.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between px-2 py-1.5 rounded-lg border bg-white cursor-pointer text-xs ${toneClasses}`}
          >
            <div>
              <p className="font-medium">
                {c.homeowner_name || c.homeowner_email || "Homeowner"}
              </p>
              <p className="text-gray-500">
                Stage: {c.lead_stage || "new"} ·{" "}
                {c.engagement_level
                  ? `${c.engagement_level.toUpperCase()}`
                  : "UNRANKED"}
              </p>
            </div>
            <div className="text-right text-gray-500">
              <p className="font-mono text-[11px]">
                {c.next_action_at
                  ? new Date(c.next_action_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : ""}
              </p>
              <p className="text-[10px]">Score: {c.engagement_score ?? 0}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

















































