"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  Package,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

interface ROIData {
  summary: {
    total_jobs: number;
    completed_jobs: number;
    total_revenue: number;
    total_cost: number;
    total_profit: number;
    avg_margin: number;
  };
  cost_breakdown: {
    materials: number;
    labor: number;
    equipment: number;
    dumpster: number;
  };
  low_margin_jobs: any[];
  high_margin_jobs: any[];
  crew_efficiency: any[];
  per_square_metrics: {
    total_squares: number;
    avg_cost_per_square: number;
    avg_profit_per_square: number;
  };
}

export default function ROIDashboardPage() {
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await fetch("/api/jobs/roi-dashboard");
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Error loading ROI data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-zinc-400">Loading ROI dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-center text-red-400">
          Failed to load ROI data
        </div>
      </div>
    );
  }

  const marginColor =
    data.summary.avg_margin < 20
      ? "text-red-500"
      : data.summary.avg_margin < 30
      ? "text-orange-500"
      : data.summary.avg_margin < 35
      ? "text-yellow-500"
      : "text-green-500";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">ROI Dashboard</h1>
        <p className="mt-2 text-zinc-400">
          Profitability metrics and performance insights
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <p className="text-2xl font-bold text-zinc-50">
                {formatCurrency(data.summary.total_revenue)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">
              Total Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <p className="text-2xl font-bold text-green-500">
                {formatCurrency(data.summary.total_profit)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">
              Average Margin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <p className={`text-2xl font-bold ${marginColor}`}>
                {data.summary.avg_margin.toFixed(2)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">
              Total Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <p className="text-2xl font-bold text-zinc-50">
                {data.summary.total_jobs}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {data.summary.completed_jobs} completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="low-margin">Low Margin Jobs</TabsTrigger>
          <TabsTrigger value="high-margin">High Margin Jobs</TabsTrigger>
          <TabsTrigger value="crews">Crew Efficiency</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Materials</span>
                    <span className="font-semibold text-zinc-50">
                      {formatCurrency(data.cost_breakdown.materials)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Labor</span>
                    <span className="font-semibold text-zinc-50">
                      {formatCurrency(data.cost_breakdown.labor)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Equipment</span>
                    <span className="font-semibold text-zinc-50">
                      {formatCurrency(data.cost_breakdown.equipment)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Dumpster</span>
                    <span className="font-semibold text-zinc-50">
                      {formatCurrency(data.cost_breakdown.dumpster)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Per-Square Metrics */}
            {data.per_square_metrics.total_squares > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Per-Square Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">
                        Total Squares
                      </span>
                      <span className="font-semibold text-zinc-50">
                        {data.per_square_metrics.total_squares.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">
                        Avg Cost/Square
                      </span>
                      <span className="font-semibold text-zinc-50">
                        {formatCurrency(data.per_square_metrics.avg_cost_per_square)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">
                        Avg Profit/Square
                      </span>
                      <span className="font-semibold text-green-500">
                        {formatCurrency(data.per_square_metrics.avg_profit_per_square)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="low-margin" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Jobs with Low Margins (&lt;30%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.low_margin_jobs.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No low margin jobs found. Great work!
                </div>
              ) : (
                <div className="space-y-2">
                  {data.low_margin_jobs.map((job) => (
                    <Link
                      key={job.job_id}
                      href={`/production/jobs/${job.job_id}`}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900"
                    >
                      <div>
                        <p className="font-medium text-zinc-50">
                          {job.customer_name}
                        </p>
                        <p className="text-sm text-zinc-400">
                          Revenue: {formatCurrency(job.revenue)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${job.margin < 20 ? "text-red-500" : "text-orange-500"}`}>
                          {job.margin.toFixed(2)}%
                        </p>
                        <p className="text-sm text-zinc-400">
                          Profit: {formatCurrency(job.profit)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="high-margin" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Top Performing Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.high_margin_jobs.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No high margin jobs found.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.high_margin_jobs.map((job) => (
                    <Link
                      key={job.job_id}
                      href={`/production/jobs/${job.job_id}`}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900"
                    >
                      <div>
                        <p className="font-medium text-zinc-50">
                          {job.customer_name}
                        </p>
                        <p className="text-sm text-zinc-400">
                          Revenue: {formatCurrency(job.revenue)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-500">
                          {job.margin.toFixed(2)}%
                        </p>
                        <p className="text-sm text-zinc-400">
                          Profit: {formatCurrency(job.profit)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crews" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Crew Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.crew_efficiency.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No crew hours data available.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.crew_efficiency.map((crew) => (
                    <div
                      key={crew.crew_name}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                      <div>
                        <p className="font-medium text-zinc-50">
                          {crew.crew_name}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {crew.jobs_count} jobs • {crew.total_hours.toFixed(1)} hours
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-zinc-50">
                          {formatCurrency(crew.total_cost)}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {formatCurrency(crew.avg_cost_per_hour)}/hr
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
































