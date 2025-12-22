// Block 20080 — Inbox Owner HUD
"use client";

import { useEffect, useState } from "react";

interface InboxSummary {
  open_leads: number;
  hot_leads: number;
  due_now: number;
  pipeline_estimated: number;
  closed_this_month: number;
}

export function InboxOwnerHud() {
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/summary");
      if (!res.ok) {
        throw new Error("Failed to load summary");
      }
      const json = await res.json();
      setSummary(json);
    } catch (error) {
      console.error("Error loading inbox summary:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const s = summary;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-700">
          Inbox Overview
        </h2>
        <button
          onClick={load}
          className="text-[11px] text-gray-500 underline hover:text-gray-700"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        <HudCard
          label="Open leads"
          value={s ? s.open_leads.toString() : "—"}
        />
        <HudCard
          label="Hot leads"
          value={s ? s.hot_leads.toString() : "—"}
          highlight="hot"
        />
        <HudCard
          label="Due now"
          value={s ? s.due_now.toString() : "—"}
          highlight={s && s.due_now > 0 ? "warn" : undefined}
        />
        <HudCard
          label="Pipeline (est.)"
          value={
            s ? `$${s.pipeline_estimated.toLocaleString()}` : "—"
          }
        />
        <HudCard
          label="Closed this month"
          value={
            s ? `$${s.closed_this_month.toLocaleString()}` : "—"
          }
          highlight="success"
        />
      </div>
    </div>
  );
}

function HudCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "hot" | "warn" | "success";
}) {
  let border = "border-gray-200";
  let bg = "bg-white";

  if (highlight === "hot") {
    border = "border-red-200";
    bg = "bg-red-50";
  } else if (highlight === "warn") {
    border = "border-amber-200";
    bg = "bg-amber-50";
  } else if (highlight === "success") {
    border = "border-emerald-200";
    bg = "bg-emerald-50";
  }

  return (
    <div className={`p-3 rounded-xl border ${border} ${bg}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

















































