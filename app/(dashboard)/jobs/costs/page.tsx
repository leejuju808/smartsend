// Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1
// Job Costing Overview Page

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface JobCostRow {
  job_id: string;
  job_title: string;
  job_value: number;
  estimated_cost: number;
  actual_cost: number;
  variance: number;
  margin_pct: number;
  status: string;
  has_overruns: boolean;
}

export default function JobCostingOverviewPage() {
  const [jobs, setJobs] = useState<JobCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadJobCosts();
  }, []);

  async function loadJobCosts() {
    try {
      setLoading(true);

      // Get all jobs with their cost data
      const { data: jobsData, error: jobsError } = await supabase
        .from("roofing_jobs")
        .select("id, title, job_value, status, workspace_id")
        .order("created_at", { ascending: false })
        .limit(100);

      if (jobsError) throw jobsError;

      // Get estimates and actual costs for each job
      const jobsWithCosts = await Promise.all(
        (jobsData || []).map(async (job) => {
          // Get estimate
          const { data: estimate } = await supabase
            .from("job_estimates")
            .select("estimated_total_cost")
            .eq("job_id", job.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Get actual costs
          const { data: actualCosts } = await supabase
            .from("job_actual_costs")
            .select("actual_total_cost, actual_profit")
            .eq("job_id", job.id)
            .maybeSingle();

          // Check for overruns
          const { data: overruns } = await supabase
            .from("job_cost_overruns")
            .select("id")
            .eq("job_id", job.id)
            .eq("acknowledged", false)
            .limit(1);

          const estimatedCost = estimate?.estimated_total_cost || 0;
          const actualCost = actualCosts?.actual_total_cost || 0;
          const variance = actualCost - estimatedCost;
          const marginPct =
            job.job_value > 0
              ? ((job.job_value - actualCost) / job.job_value) * 100
              : 0;

          return {
            job_id: job.id,
            job_title: job.title || "Untitled Job",
            job_value: job.job_value || 0,
            estimated_cost: estimatedCost,
            actual_cost: actualCost,
            variance: variance,
            margin_pct: marginPct,
            status: job.status || "unscheduled",
            has_overruns: (overruns?.length || 0) > 0,
          };
        })
      );

      setJobs(jobsWithCosts);
    } catch (error) {
      console.error("Error loading job costs:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading job costs...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">
          Job Costing Overview
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Track estimated vs actual costs and protect your margins
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-zinc-900/50 border-b border-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Job
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Estimated Cost
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Actual Cost
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Variance
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Margin %
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {jobs.map((job) => (
              <tr
                key={job.job_id}
                className="hover:bg-zinc-900/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.job_id}/costs`}
                    className="block group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-50 group-hover:text-blue-400">
                        {job.job_title}
                      </span>
                      {job.has_overruns && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
                          ⚠️ Overrun
                        </span>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {formatCurrency(job.estimated_cost)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {formatCurrency(job.actual_cost)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-sm font-medium ${
                      job.variance > 0
                        ? "text-red-400"
                        : job.variance < 0
                        ? "text-green-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {job.variance > 0 ? "+" : ""}
                    {formatCurrency(job.variance)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-sm font-medium ${
                      job.margin_pct >= 30
                        ? "text-green-400"
                        : job.margin_pct >= 20
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}
                  >
                    {job.margin_pct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                    {job.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {jobs.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-400">
            No jobs with cost data yet. Create an estimate for a job to start
            tracking costs.
          </div>
        )}
      </div>
    </div>
  );
}
































