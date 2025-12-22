"use client";

// Block 252600 — SmartSend Profitability Engine v1
// Real-Time Job Profit Dashboard
// app/workforce/profit/page.tsx

import { useEffect, useState } from "react";
import { DollarSign, TrendingDown, TrendingUp, AlertTriangle, PieChart, BarChart3 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

interface JobProfitability {
  job_id: string;
  company_id: string;
  customer_name: string;
  contract_price: number;
  labor_cost: number;
  materials_cost: number;
  subs_cost: number;
  overhead_cost: number;
  misc_cost: number;
  total_costs: number;
  profit: number;
  profit_margin: number;
  labor_cost_pct: number;
  materials_cost_pct: number;
  subs_cost_pct: number;
  overhead_cost_pct: number;
  status: string;
  job_type: string | null;
}

interface ProfitSummary {
  total_revenue: number;
  total_costs: number;
  total_profit: number;
  avg_margin: number;
  job_count: number;
}

export default function ProfitabilityDashboardPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProfitability[]>([]);
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "all">("month");

  useEffect(() => {
    // Get company_id from URL params or localStorage
    const params = new URLSearchParams(window.location.search);
    const companyIdParam = params.get("company_id") || localStorage.getItem("company_id");
    setCompanyId(companyIdParam);

    if (companyIdParam) {
      fetchProfitabilityData(companyIdParam);
    }
  }, [selectedPeriod]);

  async function fetchProfitabilityData(companyId: string) {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Build date filter
      let dateFilter = "";
      if (selectedPeriod === "week") {
        dateFilter = `created_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`;
      } else if (selectedPeriod === "month") {
        dateFilter = `created_at.gte.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`;
      }

      // Fetch jobs with profitability data
      let query = supabase
        .from("job_profitability")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (dateFilter) {
        // Note: job_profitability is a view, so we filter on the underlying jobs table
        // For now, we'll fetch all and filter client-side, or use a better approach
        query = query.limit(100);
      }

      const { data: jobsData, error } = await query;

      if (error) {
        console.error("Error fetching profitability data:", error);
        return;
      }

      // Filter by date if needed (client-side for now)
      let filteredJobs = jobsData || [];
      if (selectedPeriod !== "all") {
        const cutoffDate = selectedPeriod === "week" 
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        filteredJobs = filteredJobs.filter((job: any) => 
          new Date(job.created_at) >= cutoffDate
        );
      }

      setJobs(filteredJobs);

      // Calculate summary
      const totalRevenue = filteredJobs.reduce((sum, job) => sum + (job.contract_price || 0), 0);
      const totalCosts = filteredJobs.reduce((sum, job) => sum + (job.total_costs || 0), 0);
      const totalProfit = totalRevenue - totalCosts;
      const avgMargin = filteredJobs.length > 0
        ? filteredJobs.reduce((sum, job) => sum + (job.profit_margin || 0), 0) / filteredJobs.length
        : 0;

      setSummary({
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        total_profit: totalProfit,
        avg_margin: avgMargin,
        job_count: filteredJobs.length,
      });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  const lowMarginJobs = jobs.filter((job) => job.profit_margin < 30);
  const highPerformers = jobs
    .filter((job) => job.profit_margin >= 30)
    .sort((a, b) => b.profit_margin - a.profit_margin)
    .slice(0, 5);

  const costDistribution = {
    labor: jobs.reduce((sum, job) => sum + job.labor_cost, 0),
    materials: jobs.reduce((sum, job) => sum + job.materials_cost, 0),
    subs: jobs.reduce((sum, job) => sum + job.subs_cost, 0),
    overhead: jobs.reduce((sum, job) => sum + job.overhead_cost, 0),
  };

  const totalCostDistribution = Object.values(costDistribution).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading profitability data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profitability Dashboard</h1>
          <p className="text-gray-600">Real-time job profit, costs, and margins</p>
        </div>

        {/* Period Selector */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSelectedPeriod("week")}
            className={`px-4 py-2 rounded-lg ${
              selectedPeriod === "week"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setSelectedPeriod("month")}
            className={`px-4 py-2 rounded-lg ${
              selectedPeriod === "month"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setSelectedPeriod("all")}
            className={`px-4 py-2 rounded-lg ${
              selectedPeriod === "all"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            All Time
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${summary.total_revenue.toLocaleString()}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Costs</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${summary.total_costs.toLocaleString()}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Net Profit</p>
                  <p className={`text-2xl font-bold ${
                    summary.total_profit >= 0 ? "text-green-600" : "text-red-600"
                  }`}>
                    ${summary.total_profit.toLocaleString()}
                  </p>
                </div>
                <TrendingUp className={`h-8 w-8 ${
                  summary.total_profit >= 0 ? "text-green-600" : "text-red-600"
                }`} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Margin</p>
                  <p className={`text-2xl font-bold ${
                    summary.avg_margin >= 30 ? "text-green-600" : summary.avg_margin >= 15 ? "text-yellow-600" : "text-red-600"
                  }`}>
                    {summary.avg_margin.toFixed(1)}%
                  </p>
                </div>
                <PieChart className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Cost Distribution Pie Chart */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cost Distribution</h2>
            <div className="space-y-3">
              {totalCostDistribution > 0 && (
                <>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Labor</span>
                      <span className="text-sm font-medium">
                        {((costDistribution.labor / totalCostDistribution) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(costDistribution.labor / totalCostDistribution) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Materials</span>
                      <span className="text-sm font-medium">
                        {((costDistribution.materials / totalCostDistribution) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(costDistribution.materials / totalCostDistribution) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Subs</span>
                      <span className="text-sm font-medium">
                        {((costDistribution.subs / totalCostDistribution) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-600 h-2 rounded-full"
                        style={{ width: `${(costDistribution.subs / totalCostDistribution) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Overhead</span>
                      <span className="text-sm font-medium">
                        {((costDistribution.overhead / totalCostDistribution) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${(costDistribution.overhead / totalCostDistribution) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Low Margin Jobs Warning */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Jobs at Risk
            </h2>
            {lowMarginJobs.length > 0 ? (
              <div className="space-y-2">
                {lowMarginJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.job_id}
                    className="p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{job.customer_name}</span>
                      <span className={`text-sm font-bold ${
                        job.profit_margin < 15 ? "text-red-600" : "text-yellow-600"
                      }`}>
                        {job.profit_margin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No jobs at risk</p>
            )}
          </div>

          {/* High Performers */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Top Performers
            </h2>
            {highPerformers.length > 0 ? (
              <div className="space-y-2">
                {highPerformers.map((job) => (
                  <div
                    key={job.job_id}
                    className="p-3 bg-green-50 rounded-lg border border-green-200"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{job.customer_name}</span>
                      <span className="text-sm font-bold text-green-600">
                        {job.profit_margin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No high performers yet</p>
            )}
          </div>
        </div>

        {/* Job-Level Overview Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Job-Level Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Labor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Materials
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overhead
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.job_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{job.customer_name}</div>
                      <div className="text-sm text-gray-500">{job.job_type || "N/A"}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.contract_price.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.labor_cost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.materials_cost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.subs_cost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.overhead_cost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${job.total_costs.toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      job.profit >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      ${job.profit.toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${
                      job.profit_margin >= 30 ? "text-green-600" : 
                      job.profit_margin >= 15 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {job.profit_margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
























