'use client';

import { useEffect, useState } from "react";

type OutreachStatusResponse = {
  workspace_id: string;
  outreach: { state: "running" | "paused"; paused_at: string | null };
  capacity?: {
    demand_throttle: "low" | "normal" | "high";
    crew_capacity_jobs: number | null;
    jobs_booked_open: number;
    is_full: boolean;
    message: string | null;
  } | null;
  proof_of_life: { day: string; ran_today: boolean; ran_at: string | null };
  time_asymmetry?: {
    started_at: string | null;
    days_running: number;
    days_idle: number;
    days_total: number;
    gap_days: number;
    last_ran_day: string | null;
    restart_penalty?: { active: boolean; days_remaining: number; multiplier: number };
  };
  revenue_memory: any;
};

export function OutreachStatusWidget() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<OutreachStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWorkspaceId(localStorage.getItem("active_workspace"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const load = async () => {
      // Keep in sync with WorkspaceSwitcher changes (localStorage is the source of truth in this app).
      const current = localStorage.getItem("active_workspace");
      if (current && current !== workspaceId) {
        setWorkspaceId(current);
        return;
      }
      if (!workspaceId) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/outreach/status?workspace_id=${encodeURIComponent(workspaceId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as any;
        if (!res.ok) return;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [workspaceId]);

  if (!workspaceId) return null;

  const state = data?.outreach?.state || "running";
  const ranToday = Boolean(data?.proof_of_life?.ran_today);
  const coveredToday = state !== "paused" && ranToday;
  const fullMessage = data?.capacity?.is_full ? (data?.capacity?.message || "Demand exceeds availability.") : null;
  const signalText = data
    ? fullMessage || (coveredToday ? "Outreach covered today." : "No outreach handled today.")
    : loading
      ? "…"
      : "";

  return (
    <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="flex flex-col">
        {signalText ? (
          <div className={`text-xs ${fullMessage ? "text-red-700" : "text-gray-700"}`}>{signalText}</div>
        ) : null}
      </div>

      <div className="ml-auto text-xs font-semibold text-gray-900">
        {state === "paused" ? "PAUSED (system)" : "RUNNING"}
      </div>
    </div>
  );
}





