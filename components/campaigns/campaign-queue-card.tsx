"use client";

import { useEffect, useState } from "react";

type Usage = {
  status: "draft" | "active" | "paused" | "completed";
  daily_send_limit: number | null;
  sent_today: number;
  sent_this_month: number;
  monthly_limit: number | null;
  plan_name: string;
};

export function CampaignQueueCard({ campaignId }: { campaignId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUsage() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/usage`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load usage");
      }
      setUsage(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsage();
    // Refresh every 30 seconds
    const interval = setInterval(loadUsage, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/queue/start`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      await loadUsage();
    } catch (e: any) {
      setError(e.message ?? "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/queue/pause`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to pause");
      await loadUsage();
    } catch (e: any) {
      setError(e.message ?? "Failed to pause");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !usage) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-xs text-neutral-400">
        Loading sending status…
      </div>
    );
  }

  const isActive = usage.status === "active";
  const monthlyLimit = usage.monthly_limit;
  const ratio =
    monthlyLimit != null && monthlyLimit > 0
      ? Math.min(1, usage.sent_this_month / monthlyLimit)
      : null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-xs text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
            Sending status
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-300"
                  : usage.status === "paused"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-neutral-800 text-neutral-300"
              }`}
            >
              {usage.status.toUpperCase()}
            </span>
            <span className="text-[0.7rem] text-neutral-400">
              Plan: {usage.plan_name}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {isActive ? (
            <button
              onClick={pause}
              disabled={busy}
              className="rounded-xl border border-neutral-700 px-3 py-2 text-[0.75rem] font-semibold text-neutral-100 disabled:opacity-50 hover:bg-neutral-800 transition-colors"
            >
              Pause Sending
            </button>
          ) : (
            <button
              onClick={start}
              disabled={busy}
              className="rounded-xl bg-neutral-100 px-3 py-2 text-[0.75rem] font-semibold text-neutral-900 disabled:opacity-50 hover:bg-neutral-200 transition-colors"
            >
              Start Sending
            </button>
          )}
        </div>
      </div>

      {/* Daily stats */}
      <div className="mt-4 grid gap-3 md:grid-cols-3 text-[0.7rem]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="text-neutral-500">Sent today</div>
          <div className="mt-1 text-sm font-semibold text-neutral-50">
            {usage.sent_today}
          </div>
          {usage.daily_send_limit && (
            <div className="text-[0.65rem] text-neutral-400">
              Daily cap: {usage.daily_send_limit}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="text-neutral-500">Sent this month</div>
          <div className="mt-1 text-sm font-semibold text-neutral-50">
            {usage.sent_this_month.toLocaleString()}
          </div>
          {monthlyLimit && (
            <div className="text-[0.65rem] text-neutral-400">
              Plan limit: {monthlyLimit.toLocaleString()}
            </div>
          )}
        </div>

        {monthlyLimit && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
            <div className="text-neutral-500">Plan usage</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${(ratio ?? 0) * 100}%` }}
              />
            </div>
            <div className="mt-1 text-[0.65rem] text-neutral-400">
              {Math.round((ratio ?? 0) * 100)}% of monthly send used
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-700 bg-red-900/20 p-2 text-[0.7rem] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

























































