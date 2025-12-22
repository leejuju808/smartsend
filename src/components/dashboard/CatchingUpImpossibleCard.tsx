"use client";

import { useEffect, useMemo, useState } from "react";

type TimeAsymmetry = {
  started_at: string | null;
  days_running: number;
  days_idle: number;
  days_total: number;
  gap_days: number;
  last_ran_day: string | null;
  restart_penalty?: { active: boolean; days_remaining: number; multiplier: number };
};

type OutreachStatusResponse = {
  workspace_id: string;
  outreach: { state: "running" | "paused"; paused_at: string | null; paused_reason?: string | null };
  proof_of_life: { day: string; ran_today: boolean; ran_at: string | null };
  time_asymmetry?: TimeAsymmetry;
};

function clampInt(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function CatchingUpImpossibleCard() {
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
        const json = (await res.json().catch(() => null)) as any;
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

  const t = data?.time_asymmetry;
  const daysRunning = clampInt(t?.days_running);
  const daysIdle = clampInt(t?.days_idle);
  const gapDays = clampInt(t?.gap_days);
  const penaltyActive = Boolean(t?.restart_penalty?.active);
  const penaltyDays = clampInt(t?.restart_penalty?.days_remaining);

  const showOutworkTimeRuleOnce = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (!workspaceId) return false;
    const k = `ss_rule_outwork_time_seen:${workspaceId}`;
    return localStorage.getItem(k) !== "1";
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!workspaceId) return;
    if (!showOutworkTimeRuleOnce) return;
    const k = `ss_rule_outwork_time_seen:${workspaceId}`;
    // Mark immediately after first paint. If the user refreshes instantly, they might see it again; acceptable for v1.
    try {
      localStorage.setItem(k, "1");
    } catch {
      // ignore
    }
  }, [workspaceId, showOutworkTimeRuleOnce]);

  if (!workspaceId) return null;

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Permanent advantage</div>
      <div className="mt-2 text-sm font-semibold text-gray-900">Make “Catching Up” Impossible</div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-[11px] font-semibold text-gray-600">Days SmartSend has been running</div>
          <div className="mt-1 text-2xl font-extrabold text-gray-900">{loading && !data ? "—" : daysRunning}</div>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-[11px] font-semibold text-gray-600">Days SmartSend was idle</div>
          <div className="mt-1 text-2xl font-extrabold text-gray-900">{loading && !data ? "—" : daysIdle}</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <div className="text-xs font-semibold text-gray-900">
          Momentum gap: <span className="font-extrabold">{loading && !data ? "—" : gapDays}</span> day{gapDays === 1 ? "" : "s"}
        </div>
        <div className="mt-1 text-xs text-amber-900">This gap permanently reduces total reachable homeowners.</div>
      </div>

      {showOutworkTimeRuleOnce ? (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-900">Consistent daily outreach beats bursts of effort.</div>
        </div>
      ) : null}

      {penaltyActive ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-semibold text-gray-900">Restart ≠ Reset</div>
          <div className="mt-1 text-xs text-red-900">Penalty active ({penaltyDays} day{penaltyDays === 1 ? "" : "s"} remaining).</div>
          <ul className="mt-2 text-xs text-red-900 space-y-1">
            <li>- Volume ramps slowly</li>
            <li>- Familiarity rebuilds</li>
            <li>- Reply velocity lags temporarily</li>
          </ul>
        </div>
      ) : null}

      <div className="mt-3 text-xs text-gray-700">Long-running systems receive faster replies over time.</div>

      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-900">
        <div>Every day SmartSend runs puts me ahead of who I was yesterday.</div>
        <div className="mt-1">Every day it doesn’t run puts me permanently behind.</div>
      </div>
    </section>
  );
}



