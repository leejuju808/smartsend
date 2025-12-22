"use client";

import { useEffect, useState } from "react";

type RoiData = {
  smartsend_revenue_this_month: number | null;
  smartsend_jobs_this_month: number | null;
  plan_price: number | null;
  roi_multiple: number | null;
  roi_percent: number | null;
  plan_tier: string | null;
};

export default function RoiHero() {
  const [data, setData] = useState<RoiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roi-dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch((err) => {
        console.error("Failed to load ROI dashboard", err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-900 text-white rounded-2xl p-5 mb-6 flex items-center justify-center">
        <p className="text-sm opacity-80">Loading ROI data…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    smartsend_revenue_this_month,
    smartsend_jobs_this_month,
    plan_price,
    roi_multiple,
    roi_percent,
    plan_tier,
  } = data;

  const revenue = smartsend_revenue_this_month || 0;
  const jobs = smartsend_jobs_this_month || 0;
  const price = plan_price || 0;
  const multiple = roi_multiple ?? 0;
  const percent = roi_percent ?? 0;

  return (
    <div className="bg-blue-900 text-white rounded-2xl p-5 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-wide opacity-80">
          SmartSend ROI — {plan_tier?.toUpperCase() || "STARTER"} Plan
        </div>
        <div className="text-2xl md:text-3xl font-semibold mt-1">
          SmartSend made you{" "}
          <span className="underline decoration-emerald-400">
            ${revenue.toLocaleString()}
          </span>{" "}
          this month.
        </div>
        <div className="text-sm mt-2 opacity-90">
          From <strong>{jobs}</strong> SmartSend-sourced job
          {jobs === 1 ? "" : "s"} on a{" "}
          <strong>${price.toLocaleString()}</strong>/month plan.
        </div>
      </div>

      <div className="flex flex-col items-start md:items-end gap-1">
        <div className="text-xs opacity-80">Return on Investment</div>
        <div className="text-2xl font-semibold">
          {multiple ? `${multiple.toFixed(1)}x` : "—"}
        </div>
        <div className="text-xs opacity-80">
          {multiple
            ? `${Math.round(percent)}% ROI this month`
            : "Get your first SmartSend job to see ROI."}
        </div>
      </div>
    </div>
  );
}














































