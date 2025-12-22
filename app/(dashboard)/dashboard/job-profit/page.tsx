// Block 22340 — SmartSend Roofing Job Profit Dashboard
// Shows which roofs made money, which lost money, and why

"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Job {
  id: string;
  title?: string;
  job_value: number;
  revenue_collected: number;
  actual_total_cost: number;
  actual_gross_profit: number;
  actual_margin_pct: number;
  status: string;
  scheduled_start_date?: string;
  scheduled_end_date?: string;
}

interface JobProfitData {
  jobs: Job[];
  avgMargin: number;
  topProfitable: Job[];
  worstMargin: Job[];
}

function JobProfitRow({ job }: { job: Job }) {
  const marginColor =
    job.actual_margin_pct >= 35
      ? "text-emerald-400"
      : job.actual_margin_pct >= 20
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="border border-zinc-800 rounded-lg p-3 flex justify-between items-center bg-zinc-950">
      <div className="space-y-0.5 flex-1 min-w-0">
        <p className="font-semibold text-sm text-zinc-50 truncate">
          {job.title || "Roof Job"}
        </p>
        <p className="text-[11px] text-zinc-400">
          Revenue: ${job.revenue_collected?.toLocaleString() || 0} • Cost: $
          {job.actual_total_cost?.toLocaleString() || 0}
        </p>
      </div>
      <div className="text-right ml-4">
        <p className={`text-sm font-semibold ${marginColor}`}>
          ${job.actual_gross_profit?.toLocaleString() || 0}
        </p>
        <p className={`text-[11px] ${marginColor}`}>
          {job.revenue_collected > 0
            ? `${job.actual_margin_pct?.toFixed(1) || 0}%`
            : "—"}
        </p>
      </div>
    </div>
  );
}

export default function JobProfitDashboard() {
  const { data, error } = useSWR<JobProfitData>(
    "/api/dashboard/job-profit",
    fetcher
  );

  if (!data && !error) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-400">Loading job profit data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-400">
          Error loading data: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const { jobs, avgMargin, topProfitable, worstMargin } = data || {
    jobs: [],
    avgMargin: 0,
    topProfitable: [],
    worstMargin: [],
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Job Profit Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1">
            See which roofs are printing profit and which ones are bleeding.
          </p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 shadow-sm text-right">
          <p className="text-[11px] text-zinc-500">Average Margin (Completed)</p>
          <p className="text-lg font-semibold text-zinc-50">
            {avgMargin.toFixed(1)}%
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Profitable */}
        <section className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
          <h2 className="font-semibold text-sm mb-3 text-zinc-50">
            Top Profitable Jobs
          </h2>
          {topProfitable.length === 0 && (
            <p className="text-zinc-400 text-xs">
              No completed jobs with profit yet.
            </p>
          )}
          <div className="space-y-2">
            {topProfitable.map((j) => (
              <JobProfitRow key={j.id} job={j} />
            ))}
          </div>
        </section>

        {/* Worst Margin */}
        <section className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
          <h2 className="font-semibold text-sm mb-3 text-zinc-50">
            Jobs with Weak Margins
          </h2>
          {worstMargin.length === 0 && (
            <p className="text-zinc-400 text-xs">No completed jobs yet.</p>
          )}
          <div className="space-y-2">
            {worstMargin.map((j) => (
              <JobProfitRow key={j.id} job={j} />
            ))}
          </div>
        </section>
      </div>

      {/* Full table */}
      <section className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
        <h2 className="font-semibold text-sm mb-3 text-zinc-50">All Jobs</h2>
        <div className="max-h-72 overflow-y-auto border border-zinc-800 rounded">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="text-left p-2 text-zinc-400 font-medium">Job</th>
                <th className="text-left p-2 text-zinc-400 font-medium">Status</th>
                <th className="text-right p-2 text-zinc-400 font-medium">Revenue</th>
                <th className="text-right p-2 text-zinc-400 font-medium">Cost</th>
                <th className="text-right p-2 text-zinc-400 font-medium">Profit</th>
                <th className="text-right p-2 text-zinc-400 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td className="p-4 text-zinc-400 text-center" colSpan={6}>
                    No jobs yet.
                  </td>
                </tr>
              )}
              {jobs.map((j) => {
                const marginColor =
                  j.actual_margin_pct >= 35
                    ? "text-emerald-400"
                    : j.actual_margin_pct >= 20
                    ? "text-amber-400"
                    : "text-red-400";

                return (
                  <tr key={j.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/50">
                    <td className="p-2 text-zinc-300">{j.title || "Roof Job"}</td>
                    <td className="p-2 text-zinc-400">{j.status}</td>
                    <td className="p-2 text-right text-zinc-300">
                      ${j.revenue_collected?.toLocaleString() || 0}
                    </td>
                    <td className="p-2 text-right text-zinc-300">
                      ${j.actual_total_cost?.toLocaleString() || 0}
                    </td>
                    <td className="p-2 text-right text-zinc-300">
                      ${j.actual_gross_profit?.toLocaleString() || 0}
                    </td>
                    <td className={`p-2 text-right font-semibold ${marginColor}`}>
                      {j.revenue_collected > 0
                        ? `${j.actual_margin_pct?.toFixed(1) || 0}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}








































