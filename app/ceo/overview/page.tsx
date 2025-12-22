"use client";

// Block 252600 — SmartSend Profitability Engine v1
// CEO Dashboard - Executive-Level Profit Intelligence
// app/ceo/overview/page.tsx

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, Users, AlertCircle, BarChart3 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

interface CompanyProfitSummary {
  total_revenue: number;
  total_costs: number;
  net_profit: number;
  company_wide_margin: number;
  job_count: number;
  avg_job_value: number;
}

interface TopPerformingCrew {
  crew_id: string;
  crew_name: string;
  jobs_completed: number;
  total_revenue: number;
  total_profit: number;
  avg_margin: number;
}

interface ExpensiveJob {
  job_id: string;
  customer_name: string;
  contract_price: number;
  total_costs: number;
  profit: number;
  profit_margin: number;
}

export default function CEOOverviewPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CompanyProfitSummary | null>(null);
  const [topCrews, setTopCrews] = useState<TopPerformingCrew[]>([]);
  const [expensiveJobs, setExpensiveJobs] = useState<ExpensiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "quarter">("month");

  useEffect(() => {
    // Get company_id from URL params or localStorage
    const params = new URLSearchParams(window.location.search);
    const companyIdParam = params.get("company_id") || localStorage.getItem("company_id");
    setCompanyId(companyIdParam);

    if (companyIdParam) {
      fetchCEOData(companyIdParam);
    }
  }, [selectedPeriod]);

  async function fetchCEOData(companyId: string) {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Build date filter
      let cutoffDate: Date;
      if (selectedPeriod === "week") {
        cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      } else if (selectedPeriod === "month") {
        cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      } else {
        cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      }

      // Fetch all jobs with profitability
      const { data: jobs, error } = await supabase
        .from("job_profitability")
        .select("*")
        .eq("company_id", companyId)
        .gte("created_at", cutoffDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching CEO data:", error);
        return;
      }

      const jobsData = jobs || [];

      // Calculate company summary
      const totalRevenue = jobsData.reduce((sum, job) => sum + (job.contract_price || 0), 0);
      const totalCosts = jobsData.reduce((sum, job) => sum + (job.total_costs || 0), 0);
      const netProfit = totalRevenue - totalCosts;
      const companyWideMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      const avgJobValue = jobsData.length > 0 ? totalRevenue / jobsData.length : 0;

      setSummary({
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        net_profit: netProfit,
        company_wide_margin: companyWideMargin,
        job_count: jobsData.length,
        avg_job_value: avgJobValue,
      });

      // Get top performing crews (simplified - would need crew_id in job_profitability view)
      // For now, we'll show top jobs by margin
      const topJobs = [...jobsData]
        .sort((a, b) => (b.profit_margin || 0) - (a.profit_margin || 0))
        .slice(0, 5);

      // Get most expensive jobs (highest cost)
      const expensive = [...jobsData]
        .sort((a, b) => (b.total_costs || 0) - (a.total_costs || 0))
        .slice(0, 5)
        .map((job) => ({
          job_id: job.job_id,
          customer_name: job.customer_name || "Unknown",
          contract_price: job.contract_price || 0,
          total_costs: job.total_costs || 0,
          profit: job.profit || 0,
          profit_margin: job.profit_margin || 0,
        }));

      setExpensiveJobs(expensive);

      // Note: Top crews would require joining with crews table
      // For now, we'll leave this as placeholder
      setTopCrews([]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading executive dashboard...</p>
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">CEO Command Center</h1>
          <p className="text-gray-600">Executive-level business intelligence</p>
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
            onClick={() => setSelectedPeriod("quarter")}
            className={`px-4 py-2 rounded-lg ${
              selectedPeriod === "quarter"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            This Quarter
          </button>
        </div>

        {/* Key Metrics */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide">Total Revenue</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    ${summary.total_revenue.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {summary.job_count} jobs • ${summary.avg_job_value.toLocaleString()} avg
                  </p>
                </div>
                <DollarSign className="h-12 w-12 text-blue-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide">Total Costs</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    ${summary.total_costs.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {summary.job_count > 0
                      ? `$${(summary.total_costs / summary.job_count).toLocaleString()} per job`
                      : "N/A"}
                  </p>
                </div>
                <TrendingDown className="h-12 w-12 text-red-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide">Net Profit</p>
                  <p className={`text-3xl font-bold mt-2 ${
                    summary.net_profit >= 0 ? "text-green-600" : "text-red-600"
                  }`}>
                    ${summary.net_profit.toLocaleString()}
                  </p>
                  <p className={`text-sm font-medium mt-1 ${
                    summary.company_wide_margin >= 30 ? "text-green-600" : 
                    summary.company_wide_margin >= 15 ? "text-yellow-600" : "text-red-600"
                  }`}>
                    {summary.company_wide_margin.toFixed(1)}% margin
                  </p>
                </div>
                <TrendingUp className={`h-12 w-12 opacity-20 ${
                  summary.net_profit >= 0 ? "text-green-600" : "text-red-600"
                }`} />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Performing Crews */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Top Performing Crews
            </h2>
            {topCrews.length > 0 ? (
              <div className="space-y-3">
                {topCrews.map((crew) => (
                  <div key={crew.crew_id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{crew.crew_name}</p>
                        <p className="text-sm text-gray-600">
                          {crew.jobs_completed} jobs completed
                        </p>
                      </div>
                      <span className="text-sm font-bold text-green-600">
                        {crew.avg_margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Revenue: </span>
                        <span className="font-medium">${crew.total_revenue.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Profit: </span>
                        <span className="font-medium text-green-600">
                          ${crew.total_profit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Crew performance data coming soon</p>
            )}
          </div>

          {/* Most Expensive Jobs */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Most Expensive Jobs
            </h2>
            {expensiveJobs.length > 0 ? (
              <div className="space-y-3">
                {expensiveJobs.map((job) => (
                  <div key={job.job_id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{job.customer_name}</p>
                        <p className="text-sm text-gray-600">
                          Contract: ${job.contract_price.toLocaleString()}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${
                        job.profit_margin >= 30 ? "text-green-600" : 
                        job.profit_margin >= 15 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {job.profit_margin.toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Costs: </span>
                        <span className="font-medium">${job.total_costs.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Profit: </span>
                        <span className={`font-medium ${
                          job.profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          ${job.profit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No jobs found</p>
            )}
          </div>
        </div>

        {/* Company-Wide Profit Trend */}
        {summary && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Company Performance Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Jobs Completed</p>
                <p className="text-2xl font-bold text-gray-900">{summary.job_count}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Avg Job Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${summary.avg_job_value.toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600">Company Margin</p>
                <p className={`text-2xl font-bold ${
                  summary.company_wide_margin >= 30 ? "text-green-600" : 
                  summary.company_wide_margin >= 15 ? "text-yellow-600" : "text-red-600"
                }`}>
                  {summary.company_wide_margin.toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-gray-600">Profit per Job</p>
                <p className={`text-2xl font-bold ${
                  summary.job_count > 0 && (summary.net_profit / summary.job_count) >= 0
                    ? "text-green-600" : "text-red-600"
                }`}>
                  ${summary.job_count > 0 
                    ? (summary.net_profit / summary.job_count).toLocaleString() 
                    : "0"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
























