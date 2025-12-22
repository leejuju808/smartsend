/* BLOCK 287000 — SmartSend Offer Amplifier v1 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Plan = "starter" | "growth" | "domination";

type OfferAmplifierPayload = {
  should_show: boolean;
  company_id: string;
  impression_id: string | null;
  plan_highlighted: Plan;
  founder_eligible: boolean;
  metrics: {
    estimates_sent: number;
    jobs_approved: number;
    revenue_closed: number;
    jobs_recovered: number;
    avg_time_saved_min: number | null;
  };
  cost_reframe: {
    avg_job_value: number;
    monthly_plan_price: number;
    months_covered: number;
  };
};

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function formatDuration(min: number | null) {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} hrs`;
  const days = hrs / 24;
  return `${days.toFixed(1)} days`;
}

export function OfferAmplifierPanel() {
  const [data, setData] = useState<OfferAmplifierPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "upgrade" | "founder" | "pause" | "dismiss">(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/roofing/offer-amplifier", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json || !json.should_show) {
          setData(null);
          setOpen(false);
          return;
        }
        setData(json as OfferAmplifierPayload);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setData(null);
          setOpen(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = data?.plan_highlighted || "growth";

  const monthsLine = useMemo(() => {
    if (!data) return "—";
    const m = Math.max(0, Math.floor(data.cost_reframe.months_covered || 0));
    if (!m) return "—";
    return `${m} month${m === 1 ? "" : "s"}`;
  }, [data]);

  async function logAction(action_taken: "upgrade" | "dismissed" | "paused") {
    if (!data?.company_id) return;
    await fetch("/api/roofing/offer-amplifier/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: data.company_id,
        impression_id: data.impression_id,
        action_taken,
      }),
    }).catch(() => {});
  }

  async function startCheckout(opts: { founderPricing?: boolean }) {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_key: plan,
        founder_pricing: !!opts.founderPricing,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.url) throw new Error(j?.error || "Failed to start checkout");
    window.location.href = j.url;
  }

  if (!open || !data) return null;

  return (
    <div className="fixed right-4 top-24 z-40 w-[360px] max-w-[calc(100vw-2rem)]">
      <div className="rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">What You’re Getting</div>
          <div className="text-base font-semibold text-slate-900 mt-1">Make the Yes the Obvious Choice</div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Live metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Estimates Sent" value={data.metrics.estimates_sent.toLocaleString()} />
            <Metric label="Jobs Approved" value={data.metrics.jobs_approved.toLocaleString()} />
            <Metric label="Revenue Closed" value={formatMoney(data.metrics.revenue_closed)} />
            <Metric label="Jobs Recovered" value={data.metrics.jobs_recovered.toLocaleString()} />
            <Metric label="Avg Time Saved" value={formatDuration(data.metrics.avg_time_saved_min)} />
          </div>

          {/* Static comparison */}
          <div className="text-sm text-slate-700 leading-snug">
            <div className="font-medium">Typical roofer loses jobs due to slow estimates and missed follow-ups.</div>
            <div className="mt-1">SmartSend removes both.</div>
          </div>

          {/* Cost reframe */}
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cost Reframe</div>
            <div className="text-sm text-slate-900 mt-1">
              One average roofing job covers <span className="font-semibold">{monthsLine}</span> of SmartSend.
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Avg job: {formatMoney(data.cost_reframe.avg_job_value)} • Plan: {formatMoney(data.cost_reframe.monthly_plan_price)}/mo
            </div>
          </div>

          {/* Plan highlight (visual only) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recommended</div>
            <div className="grid grid-cols-3 gap-2">
              <PlanChip name="Starter" active={plan === "starter"} />
              <PlanChip name="Growth" active={plan === "growth"} />
              <PlanChip name="Domination" active={plan === "domination"} />
            </div>
          </div>

          {/* CTA stack (LOCKED) */}
          <div className="space-y-2 pt-1">
            <Button
              className="w-full"
              disabled={busy != null}
              onClick={async () => {
                setBusy("upgrade");
                try {
                  await logAction("upgrade");
                  await startCheckout({ founderPricing: false });
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "upgrade" ? "Starting…" : "Upgrade & Keep Momentum"}
            </Button>

            {data.founder_eligible ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy != null}
                onClick={async () => {
                  setBusy("founder");
                  try {
                    await logAction("upgrade");
                    await startCheckout({ founderPricing: true });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "founder" ? "Starting…" : "Lock Founder Pricing"}
              </Button>
            ) : null}

            <Button
              variant="secondary"
              className="w-full"
              disabled={busy != null}
              onClick={async () => {
                setBusy("pause");
                try {
                  await logAction("paused");
                  setOpen(false);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Pause
            </Button>

            <button
              className="w-full text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 disabled:opacity-50"
              disabled={busy != null}
              onClick={async () => {
                setBusy("dismiss");
                try {
                  await logAction("dismissed");
                  setOpen(false);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Dismiss (once per day)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function PlanChip({ name, active }: { name: string; active: boolean }) {
  return (
    <div
      className={[
        "rounded-xl border px-2 py-2 text-center text-xs font-semibold",
        active ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700",
      ].join(" ")}
    >
      {name}
    </div>
  );
}









