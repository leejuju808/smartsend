"use client";

import { useEffect, useMemo, useState } from "react";

type KillSwitchStatus = {
  now: string;
  outreach_sends_today: number;
  homeowners_contacted_today: number;
  on_job_today: boolean;
  silence: boolean;
  paused_campaigns_count: number;
  idle_hot_warm: {
    lead_count: number;
    base_value: number;
    started_at: string | null;
    top: Array<{
      contact_id: string;
      display_name: string;
      last_touch_at: string;
      estimated_value: number;
      idle_seconds: number;
    }>;
  };
  reengage_opportunities: {
    count: number;
    top: Array<{
      id: string;
      display_name: string;
      email: string | null;
      company: string | null;
      estimated_job_value: number | null;
      updated_at: string | null;
    }>;
  };
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtHhMm(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function KillSwitchPanel() {
  const [data, setData] = useState<KillSwitchStatus | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);

  const fetchStatus = async () => {
    const res = await fetch("/api/kill-switch/status", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as KillSwitchStatus | null;
    if (!json) return;
    setData(json);
    setNow(new Date(json.now));
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow((d) => new Date(d.getTime() + 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const idle = data?.idle_hot_warm;

  // Ramp risk to "full at-risk" over an 8-hour stall window.
  const idleRisk = useMemo(() => {
    if (!idle || idle.lead_count <= 0 || !idle.started_at) return null;
    const started = new Date(idle.started_at);
    const elapsedMs = now.getTime() - started.getTime();
    const rampMs = 8 * 60 * 60 * 1000;
    const pct = Math.max(0, Math.min(1, elapsedMs / rampMs));
    const atRisk = Math.round(idle.base_value * pct);
    return {
      at_risk: atRisk,
      elapsed_seconds: Math.floor(elapsedMs / 1000),
      pct,
    };
  }, [idle, now]);

  const resumeSending = async () => {
    try {
      setBusy(true);
      await fetch("/api/sending/resume", { method: "POST" });
      await fetchStatus();
    } finally {
      setBusy(false);
    }
  };

  // Silence Visualization (covers everything, intentionally)
  if (data?.silence) {
    return (
      <div className="fixed inset-0 z-[200] bg-white">
        <div className="h-full w-full flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="text-2xl font-semibold text-gray-900">No outreach ran today.</div>
          <button
            onClick={resumeSending}
            disabled={busy}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Resume sending
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const showWhileWorking = data.on_job_today && data.homeowners_contacted_today > 0;
  const showResume = data.paused_campaigns_count > 0;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900">Kill-Switch</div>
          <div className="text-[11px] text-gray-500">Make “off” feel expensive.</div>
        </div>
        {showResume ? (
          <button
            onClick={resumeSending}
            disabled={busy}
            className="shrink-0 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Resume sending
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {/* 1) Idle Time Cost Counter */}
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-gray-500">Hot/Warm sitting untouched</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {idleRisk ? `~${money(idleRisk.at_risk)}` : "$0"}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {idle?.lead_count ? `${idle.lead_count} lead${idle.lead_count === 1 ? "" : "s"} • timer ${idleRisk ? fmtHhMm(idleRisk.elapsed_seconds) : "00:00"}` : "No stalled HOT/WARM leads."}
          </div>
        </div>

        {/* 3) Auto-Resurface Lost Jobs */}
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-gray-500">Re-engage opportunities (30d)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{data.reengage_opportunities.count}</div>
          <div className="mt-2 space-y-1">
            {data.reengage_opportunities.top.slice(0, 3).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0 truncate text-gray-900">{c.display_name}</div>
                <div className="shrink-0 text-gray-500">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4) Missed-While-Working Proof */}
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-gray-500">Proof</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {showWhileWorking
              ? `${data.homeowners_contacted_today} homeowner${data.homeowners_contacted_today === 1 ? "" : "s"} contacted while you were on a job today.`
              : `Homeowners contacted today: ${data.homeowners_contacted_today}`}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Turning it off means going blind while you’re working.
          </div>
        </div>
      </div>
    </section>
  );
}








