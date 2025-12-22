"use client";

import { useEffect, useState } from "react";

type StepMetric = {
  step_index: number;
  emails_sent: number;
};

type CampaignMetrics = {
  leads_total: number;
  leads_active: number;
  emails_sent: number;
  replied_leads: number;
  hot_leads: number;
  jobs_won: number;
  revenue_won: number;
  step_metrics: StepMetric[];
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function CampaignPerformancePanel({ campaignId }: { campaignId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/metrics`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data: CampaignMetrics = await res.json();
        setMetrics(data);
      } catch (e) {
        console.error("Metrics load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  if (loading || !metrics) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-xs text-neutral-400">
        Loading campaign performance…
      </div>
    );
  }

  const replyRate =
    metrics.leads_total > 0
      ? ((metrics.replied_leads / metrics.leads_total) * 100).toFixed(1)
      : "0.0";

  const hotRate =
    metrics.leads_total > 0
      ? ((metrics.hot_leads / metrics.leads_total) * 100).toFixed(1)
      : "0.0";

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-50">
            Campaign Performance
          </h2>
          <p className="text-xs text-neutral-400">
            Leads, replies, hot leads, and revenue attributed to this campaign.
          </p>
        </div>
      </div>

      {/* Top stats grid */}
      <div className="grid gap-3 md:grid-cols-4 text-xs">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-3">
          <div className="text-[0.65rem] uppercase tracking-wide text-neutral-500">
            Leads imported
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-50">
            {metrics.leads_total}
          </div>
          <div className="text-[0.7rem] text-neutral-400">
            {metrics.leads_active} active
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-3">
          <div className="text-[0.65rem] uppercase tracking-wide text-neutral-500">
            Replies & Hot Leads
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-50">
            {metrics.replied_leads} replies
          </div>
          <div className="text-[0.7rem] text-neutral-400">
            {metrics.hot_leads} hot • {replyRate}% reply / {hotRate}% hot
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-3">
          <div className="text-[0.65rem] uppercase tracking-wide text-neutral-500">
            Emails Sent
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-50">
            {metrics.emails_sent}
          </div>
          <div className="text-[0.7rem] text-neutral-400">
            Across all steps
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-700/60 bg-neutral-950/90 p-3">
          <div className="text-[0.65rem] uppercase tracking-wide text-emerald-300">
            Jobs Won from This Campaign
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-50">
            {metrics.jobs_won}
          </div>
          <div className="text-[0.7rem] text-emerald-300">
            {fmtCurrency(metrics.revenue_won)}
          </div>
        </div>
      </div>

      {/* Step metrics */}
      {metrics.step_metrics.length > 0 && (
        <div className="space-y-2">
          <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
            Per-step sending
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-neutral-950">
                <tr className="text-neutral-400">
                  <th className="px-3 py-2 text-left">Step</th>
                  <th className="px-3 py-2 text-left">Emails Sent</th>
                </tr>
              </thead>
              <tbody>
                {metrics.step_metrics.map((s) => (
                  <tr
                    key={s.step_index}
                    className="border-t border-neutral-800 bg-neutral-950/80 text-neutral-200"
                  >
                    <td className="px-3 py-2">
                      Step {s.step_index + 1}
                    </td>
                    <td className="px-3 py-2">{s.emails_sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.65rem] text-neutral-500">
            Want deeper analytics (e.g. replies by step)? We can extend this
            once reply → step tracking is wired.
          </p>
        </div>
      )}
    </section>
  );
}



