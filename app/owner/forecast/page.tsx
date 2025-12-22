// Block 27520 — SmartSend Roofing Revenue & Install Load Forecast Dashboard
// Owner-only view • 30/60/90 day revenue projections • Install load vs capacity

"use client";

import { useEffect, useState } from "react";

type RevenueWindow = {
  window_bucket: string;
  total_scheduled: number;
  total_pipeline: number;
  total_projected: number;
};

type DailyRevenue = {
  date_bucket: string;
  scheduled_revenue: number;
  pipeline_revenue: number;
  total_projected: number;
  window_bucket: string;
};

type InstallWeek = {
  week_start: string;
  jobs_count: number;
  total_squares: number;
  weekly_capacity_squares: number;
  capacity_ratio: number | null;
};

type ForecastData = {
  windows: RevenueWindow[];
  daily: DailyRevenue[];
  monthly_target: number | null;
};

type InstallData = {
  weekly: InstallWeek[];
};

export default function ForecastPage() {
  const [revenue, setRevenue] = useState<ForecastData | null>(null);
  const [install, setInstall] = useState<InstallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/owner/forecast/revenue")
        .then((r) => {
          if (!r.ok) throw new Error(`Revenue forecast failed: ${r.statusText}`);
          return r.json();
        }),
      fetch("/api/owner/forecast/install")
        .then((r) => {
          if (!r.ok) throw new Error(`Install forecast failed: ${r.statusText}`);
          return r.json();
        }),
    ])
      .then(([rev, inst]) => {
        setRevenue(rev);
        setInstall(inst);
      })
      .catch((err) => {
        console.error("Forecast fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading forecast...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!revenue || !install) {
    return (
      <div className="p-6">
        <div>No forecast data available</div>
      </div>
    );
  }

  const windows = revenue.windows || [];
  const installWeeks = install.weekly || [];
  const monthlyTarget = revenue.monthly_target;

  const getWindow = (bucket: string) =>
    windows.find((w) => w.window_bucket === bucket) || {
      window_bucket: bucket,
      total_scheduled: 0,
      total_pipeline: 0,
      total_projected: 0,
    };

  const next30 = getWindow("30");
  const next60 = getWindow("60");
  const next90 = getWindow("90");

  // Calculate target comparison for 30-day window
  const targetComparison =
    monthlyTarget && next30.total_projected > 0
      ? (next30.total_projected / monthlyTarget) * 100
      : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Forecast — Revenue & Production</h1>
        <p className="text-gray-600">
          SmartSend predicts your next 30/60/90 days based on scheduled jobs and
          active pipeline.
        </p>
      </div>

      {/* Target Warning */}
      {monthlyTarget && targetComparison !== null && (
        <div
          className={`rounded-xl border p-4 ${
            targetComparison >= 100
              ? "bg-green-50 border-green-200"
              : targetComparison >= 70
              ? "bg-yellow-50 border-yellow-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">
                {targetComparison >= 100
                  ? "✅ On Track"
                  : targetComparison >= 70
                  ? "⚠️ Behind Target"
                  : "🚨 Significantly Behind"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Next 30 days projected: ${formatNumber(next30.total_projected)} vs
                target: ${formatNumber(monthlyTarget)} ({targetComparison.toFixed(0)}%)
              </div>
            </div>
            {targetComparison < 100 && (
              <div className="text-xs text-gray-500">
                Suggestion: Increase outbound on high-ROI sources
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revenue tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ForecastTile
          label="Next 30 Days"
          scheduled={next30.total_scheduled}
          pipeline={next30.total_pipeline}
          total={next30.total_projected}
          target={monthlyTarget}
        />
        <ForecastTile
          label="Next 60 Days"
          scheduled={next60.total_scheduled}
          pipeline={next60.total_pipeline}
          total={next60.total_projected}
        />
        <ForecastTile
          label="Next 90 Days"
          scheduled={next90.total_scheduled}
          pipeline={next90.total_pipeline}
          total={next90.total_projected}
        />
      </div>

      {/* Install load vs capacity */}
      <div className="rounded-xl border bg-white shadow-sm p-4">
        <h2 className="font-semibold mb-3 text-sm">Install Load vs Capacity (Weekly)</h2>
        {installWeeks.length === 0 ? (
          <div className="text-sm text-gray-400">No install data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th align="left" className="pb-2">Week</th>
                  <th align="right" className="pb-2">Jobs</th>
                  <th align="right" className="pb-2">Squares Scheduled</th>
                  <th align="right" className="pb-2">Squares Capacity</th>
                  <th align="right" className="pb-2">Capacity Use</th>
                </tr>
              </thead>
              <tbody>
                {installWeeks.map((w) => {
                  const ratio = w.capacity_ratio || 0;
                  let className = "text-green-700";
                  if (ratio > 1.05) className = "text-red-700";
                  else if (ratio > 0.8) className = "text-yellow-700";
                  else if (ratio < 0.6) className = "text-gray-500";

                  return (
                    <tr key={w.week_start} className="border-b last:border-0">
                      <td className="py-2">
                        {new Date(w.week_start).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td align="right" className="py-2">
                        {w.jobs_count}
                      </td>
                      <td align="right" className="py-2">
                        {w.total_squares}
                      </td>
                      <td align="right" className="py-2">
                        {w.weekly_capacity_squares || 0}
                      </td>
                      <td align="right" className={`py-2 font-medium ${className}`}>
                        {ratio ? `${(ratio * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ForecastTile({
  label,
  scheduled = 0,
  pipeline = 0,
  total = 0,
  target,
}: {
  label: string;
  scheduled?: number;
  pipeline?: number;
  total?: number;
  target?: number | null;
}) {
  const targetPct = target && total > 0 ? (total / target) * 100 : null;

  return (
    <div className="rounded-xl border bg-white shadow-sm p-4 space-y-1">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-xs text-gray-500 mt-2">Scheduled</div>
      <div className="text-lg font-bold">
        ${formatNumber(Number(scheduled || 0))}
      </div>
      <div className="text-xs text-gray-500 mt-1">Pipeline (expected)</div>
      <div className="text-lg font-bold">
        ${formatNumber(Number(pipeline || 0))}
      </div>
      <div className="text-xs text-gray-500 mt-1">Total Projected</div>
      <div className="text-2xl font-bold">
        ${formatNumber(Number(total || 0))}
      </div>
      {target && label === "Next 30 Days" && targetPct !== null && (
        <div className="mt-2 pt-2 border-t">
          <div className="text-xs text-gray-500">vs Target</div>
          <div
            className={`text-sm font-semibold ${
              targetPct >= 100
                ? "text-green-600"
                : targetPct >= 70
                ? "text-yellow-600"
                : "text-red-600"
            }`}
          >
            {targetPct.toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "K";
  }
  return num.toFixed(0);
}



































