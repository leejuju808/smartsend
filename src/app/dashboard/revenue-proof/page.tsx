"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type RevenueProofPayload = {
  period: { month_start: string };
  top: {
    revenue_closed: number;
    jobs_won: number;
    jobs_recovered: number;
  };
  middle: {
    estimates_sent: number;
    estimates_approved: number;
    approval_pct: number;
  };
  bottom: {
    avg_send_speed_min: number | null;
    avg_close_speed_min: number | null;
  };
  subscription: {
    plan: string;
    renewal_date: string | null;
    status: string;
    is_active: boolean;
  };
};

type ConsistencyProofPayload = {
  ok: boolean;
  window_days: number;
  active: { days: number; replies: number; jobs_booked: number };
  inactive: { days: number; replies: number; jobs_booked: number };
};

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
      n || 0
    );
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function formatPct(p: number) {
  const x = Number.isFinite(p) ? p : 0;
  return `${Math.round(x * 100)}%`;
}

function formatDuration(min: number | null) {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} hrs`;
  const days = hrs / 24;
  return `${days.toFixed(1)} days`;
}

function MetricCard(props: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{props.label}</div>
      <div className={props.big ? "text-4xl font-extrabold tracking-tight mt-2" : "text-2xl font-bold mt-2"}>
        {props.value}
      </div>
      {props.sub ? <div className="text-xs text-gray-500 mt-1">{props.sub}</div> : null}
    </div>
  );
}

function StatusBadge({ status, isActive }: { status: string; isActive: boolean }) {
  const label = isActive ? "Active" : "Past Due";
  const cls = isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function RevenueProofDashboardPage() {
  const [data, setData] = useState<RevenueProofPayload | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyProofPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const [res, cons] = await Promise.all([
          fetch("/api/revenue-proof", { cache: "no-store" }),
          fetch("/api/enforce/consistency", { cache: "no-store" }),
        ]);
        const json = await res.json().catch(() => ({}));
        const consJson = await cons.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load dashboard");
        setData(json as RevenueProofPayload);
        setConsistency((cons.ok ? (consJson as ConsistencyProofPayload) : null) ?? null);
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const monthLabel = useMemo(() => {
    const iso = data?.period?.month_start;
    if (!iso) return "This Month";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [data?.period?.month_start]);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="h-28 bg-gray-200 rounded" />
            <div className="h-28 bg-gray-200 rounded" />
            <div className="h-28 bg-gray-200 rounded" />
          </div>
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold">Revenue Proof</h1>
        <p className="text-sm text-gray-600 mt-2">{error || "No data"}</p>
        <div className="mt-4">
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  const inactiveBanner = !data.subscription.is_active;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Revenue Proof</h1>
          <p className="text-sm text-gray-600 mt-1">{monthLabel}</p>
        </div>
      </div>

      {inactiveBanner ? (
        <div className="mb-4 border border-yellow-200 bg-yellow-50 rounded-xl p-4">
          <div className="text-sm font-semibold text-yellow-900">
            You’ve closed real jobs with SmartSend. Reactivate to keep sending estimates.
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main proof grid */}
        <div className="lg:col-span-8 space-y-5">
          {/* Cause → effect (numbers only) */}
          {consistency?.ok ? (
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Active vs inactive days (last {consistency.window_days} days)</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4">
                  <div className="text-sm font-semibold">Active days</div>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500">Days</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.active.days}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Replies</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.active.replies}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Jobs</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.active.jobs_booked}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm font-semibold">Inactive days</div>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500">Days</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.inactive.days}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Replies</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.inactive.replies}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Jobs</div>
                      <div className="text-xl font-bold tabular-nums">{consistency.inactive.jobs_booked}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Top row (big numbers) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="$ Closed This Month" value={formatMoney(data.top.revenue_closed)} big />
            <MetricCard label="Jobs Won" value={data.top.jobs_won.toLocaleString()} big />
            <MetricCard label="Jobs Recovered" value={data.top.jobs_recovered.toLocaleString()} big />
          </div>

          {/* Middle row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Estimates Sent" value={data.middle.estimates_sent.toLocaleString()} />
            <MetricCard label="Estimates Approved" value={data.middle.estimates_approved.toLocaleString()} />
            <MetricCard label="Approval %" value={formatPct(data.middle.approval_pct)} />
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard label="Avg Send Speed" value={formatDuration(data.bottom.avg_send_speed_min)} />
            <MetricCard label="Avg Close Speed" value={formatDuration(data.bottom.avg_close_speed_min)} />
          </div>
        </div>

        {/* Subscription panel */}
        <div className="lg:col-span-4">
          <div className="bg-white border rounded-xl p-5 shadow-sm sticky top-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Subscription</div>
                <div className="text-xs text-gray-500 mt-1">Proof is real. Keep it running.</div>
              </div>
              <StatusBadge status={data.subscription.status} isActive={data.subscription.is_active} />
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Current Plan</div>
                <div className="text-sm font-semibold">{data.subscription.plan}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Renewal Date</div>
                <div className="text-sm font-semibold">
                  {data.subscription.renewal_date
                    ? new Date(data.subscription.renewal_date).toLocaleDateString()
                    : "—"}
                </div>
              </div>

              <div className="pt-2">
                <Link href="/settings/billing">
                  <Button className="w-full">{data.subscription.is_active ? "Upgrade" : "Reactivate / Upgrade"}</Button>
                </Link>
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Status shows as <span className="font-semibold">Active</span> when your subscription is active or trialing,
              otherwise <span className="font-semibold">Past Due</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}










