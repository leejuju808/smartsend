"use client";

import { useEffect, useMemo, useState } from "react";

type TimelineItem = { date: string; label: string; value: number };
type Closeout = {
  show: boolean;
  month: string;
  emailsSent: number;
  replies: number;
  jobsBooked: number;
  jobsClosed: number;
  estimatedRevenue: number;
};

type FinancialRealityData = {
  smartSendCostThisMonth: number;
  jobsClosedThisMonth: number;
  avgSmartSendCostPerClosedJob: number | null;
  estimatedJobValueGenerated: number;
  paidForItself: boolean;
  attributionLine: string;
  timeline: TimelineItem[];
  closeout: Closeout;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function FinancialRealityBar() {
  const [data, setData] = useState<FinancialRealityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/financial-reality")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch((err) => {
        console.error("Failed to load financial reality", err);
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const paidLine = useMemo(() => {
    if (!data?.paidForItself) return null;
    return "SmartSend has paid for itself this month.";
  }, [data?.paidForItself]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!data) return null;

  const costPerClosedJobText =
    data.avgSmartSendCostPerClosedJob === null
      ? "—"
      : formatCurrencyCompact(data.avgSmartSendCostPerClosedJob);

  return (
    <section className="sticky top-20 z-30 rounded-2xl border bg-card/95 p-5 shadow-sm backdrop-blur">
      {/* Blunt benchmark */}
      <div className="text-2xl md:text-3xl font-semibold tabular-nums">
        Avg SmartSend cost per closed job: {costPerClosedJobText}
        {costPerClosedJobText === "—" ? "" : "."}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        Ad-based leads typically cost more and require manual follow-up.
      </div>

      {/* Quiet experiment */}
      <div className="mt-4 rounded-xl border bg-background p-4">
        <div className="text-sm font-medium">Turn off one thing (7 days)</div>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Pause one ad channel for 7 days</li>
          <li>Keep SmartSend running</li>
          <li>Nothing else changes</li>
        </ul>
      </div>

      {/* Top: two numbers only */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            SmartSend Cost (This Month)
          </div>
          <div className="text-3xl font-semibold tabular-nums">
            {formatCurrency(data.smartSendCostThisMonth)}
          </div>
        </div>

        <div className="flex flex-col gap-1 md:items-end">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Estimated Job Value Generated
          </div>
          <div className="text-3xl font-semibold tabular-nums">
            {formatCurrency(data.estimatedJobValueGenerated)}
          </div>
        </div>
      </div>

      {paidLine ? (
        <div className="mt-2 text-xs text-muted-foreground">{paidLine}</div>
      ) : null}

      <div className="mt-3 text-sm text-muted-foreground">{data.attributionLine}</div>

      {/* Job value timeline (straight list) */}
      <div className="mt-4">
        {data.timeline.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No SmartSend-attributed value yet this month.
          </div>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.timeline.map((item) => (
              <li key={item.date} className="flex items-center justify-between">
                <span className="text-muted-foreground">{item.label}:</span>
                <span className="font-medium tabular-nums">
                  +{formatCurrency(item.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Monthly close-out snapshot */}
      {data.closeout?.show ? (
        <div className="mt-5 rounded-xl border bg-background p-4">
          <div className="text-sm font-medium">Monthly close-out ({data.closeout.month})</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Homeowners contacted
              </span>
              <span className="font-semibold tabular-nums">{data.closeout.emailsSent}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Homeowners responding
              </span>
              <span className="font-semibold tabular-nums">{data.closeout.replies}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Jobs booked
              </span>
              <span className="font-semibold tabular-nums">{data.closeout.jobsBooked}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Jobs closed
              </span>
              <span className="font-semibold tabular-nums">{data.closeout.jobsClosed}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Estimated revenue
              </span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(data.closeout.estimatedRevenue)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}








