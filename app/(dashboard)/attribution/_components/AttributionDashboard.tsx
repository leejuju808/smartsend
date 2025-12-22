/**
 * Block 93000 — Attribution Dashboard Component
 * Displays source performance metrics and charts
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface SourcePerformance {
  id: string;
  source_name: string;
  channel_type: string;
  total_leads: number;
  booked_estimates: number;
  jobs_won: number;
  total_revenue: number;
  total_cost: number;
  roi_percentage: number | null;
  close_rate: number;
  cost_per_booked_estimate: number | null;
  cost_per_job: number | null;
}

interface DashboardData {
  totals: {
    total_leads: number;
    booked_estimates: number;
    jobs_won: number;
    total_revenue: number;
    total_cost: number;
    roi: number | null;
    close_rate: number;
    cost_per_booked: number | null;
    cost_per_job: number | null;
  };
  source_performance: SourcePerformance[];
}

export function AttributionDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/attribution/dashboard?days=30")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load attribution data:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-center py-8">Loading attribution data...</div>;
  }

  if (!data) {
    return <div className="text-center py-8 text-red-600">Failed to load attribution data</div>;
  }

  const { totals, source_performance } = data;
  const formatSourceDisplay = (name: string) => {
    const n = (name || "").trim();
    const s = n.toLowerCase();
    if (
      s === "cold email" ||
      s.includes("smartsend") ||
      s.includes("outreach") ||
      s.includes("sequence") ||
      s.includes("campaign") ||
      s.includes("follow-up")
    ) {
      return "SmartSend Outreach";
    }
    return n;
  };

  const prioritySort = (sp: SourcePerformance) => {
    const s = (sp.source_name || "").toLowerCase();
    const channel = (sp.channel_type || "").toLowerCase();
    if (
      s.includes("smartsend") ||
      s.includes("cold email") ||
      s.includes("outreach") ||
      s.includes("sequence") ||
      s.includes("campaign") ||
      channel === "outbound"
    )
      return 3;
    if (s.includes("referral")) return 2;
    if (s.includes("google") || s.includes("facebook") || s.includes("ads"))
      return 1;
    return 0;
  };

  const sortedSources = [...source_performance].sort((a, b) => {
    const p = prioritySort(b) - prioritySort(a);
    if (p !== 0) return p;
    // numbers do it: revenue-first within same tier
    return (b.total_revenue || 0) - (a.total_revenue || 0);
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.total_leads.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Booked Estimates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.booked_estimates.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">
              {totals.close_rate.toFixed(1)}% close rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.total_revenue)}</div>
            {totals.roi !== null && (
              <p className={`text-xs mt-1 ${totals.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totals.roi >= 0 ? "+" : ""}
                {totals.roi.toFixed(1)}% ROI
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cost Per Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.cost_per_job ? formatCurrency(totals.cost_per_job) : "N/A"}
            </div>
            {totals.cost_per_booked && (
              <p className="text-xs text-gray-500 mt-1">
                {formatCurrency(totals.cost_per_booked)} per estimate
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Source Performance</CardTitle>
          <CardDescription>
            Revenue, ROI, and conversion metrics by lead source
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Source</th>
                  <th className="text-right py-3 px-4 font-semibold">Leads</th>
                  <th className="text-right py-3 px-4 font-semibold">Booked</th>
                  <th className="text-right py-3 px-4 font-semibold">Jobs Won</th>
                  <th className="text-right py-3 px-4 font-semibold">Revenue</th>
                  <th className="text-right py-3 px-4 font-semibold">Cost</th>
                  <th className="text-right py-3 px-4 font-semibold">ROI</th>
                  <th className="text-right py-3 px-4 font-semibold">Close Rate</th>
                </tr>
              </thead>
              <tbody>
                {source_performance.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      No attribution data yet. Leads will be automatically tagged as they come in.
                    </td>
                  </tr>
                ) : (
                  sortedSources.map((source) => (
                    <tr key={source.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">
                            {formatSourceDisplay(source.source_name)}
                          </div>
                          <div className="text-xs text-gray-500">{source.channel_type}</div>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">{source.total_leads}</td>
                      <td className="text-right py-3 px-4">{source.booked_estimates}</td>
                      <td className="text-right py-3 px-4">{source.jobs_won}</td>
                      <td className="text-right py-3 px-4 font-medium">
                        {formatCurrency(parseFloat(source.total_revenue.toString()))}
                      </td>
                      <td className="text-right py-3 px-4">
                        {formatCurrency(parseFloat(source.total_cost.toString()))}
                      </td>
                      <td className="text-right py-3 px-4">
                        {source.roi_percentage !== null ? (
                          <span
                            className={
                              source.roi_percentage >= 0 ? "text-green-600" : "text-red-600"
                            }
                          >
                            {source.roi_percentage >= 0 ? "+" : ""}
                            {source.roi_percentage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        {source.close_rate.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



























