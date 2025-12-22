"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TodayJobsPanel } from "./TodayJobsPanel";
import { RevenueTrackingPanel } from "./RevenueTrackingPanel";
import { CrewLoadPanel } from "./CrewLoadPanel";
import { MaterialIssuesPanel } from "./MaterialIssuesPanel";
import { InsuranceProgressPanel } from "./InsuranceProgressPanel";
import { JobHealthPanel } from "./JobHealthPanel";
import { ActionSuggestionsPanel } from "./ActionSuggestionsPanel";

interface DashboardData {
  today_jobs: any[];
  revenue: any;
  crew_load: any[];
  material_issues: any[];
  insurance: {
    jobs: any[];
    stats: any;
  };
  job_health: any;
  action_suggestions: any;
}

export default function OpsDashboardClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const response = await fetch("/api/dashboard/ops");
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard data");
        }
        const dashboardData = await response.json();
        setData(dashboardData);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard");
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 w-32 bg-gray-200 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-24 bg-gray-100 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Panel 1: Today's Jobs - Full Width */}
      <div className="md:col-span-2 lg:col-span-3">
        <TodayJobsPanel jobs={data.today_jobs} />
      </div>

      {/* Panel 2: Revenue Tracking */}
      <div className="md:col-span-2">
        <RevenueTrackingPanel revenue={data.revenue} />
      </div>

      {/* Panel 3: Crew Load */}
      <div>
        <CrewLoadPanel crews={data.crew_load} />
      </div>

      {/* Panel 4: Material Issues */}
      <div className="md:col-span-2">
        <MaterialIssuesPanel issues={data.material_issues} />
      </div>

      {/* Panel 5: Insurance Progress */}
      <div>
        <InsuranceProgressPanel
          jobs={data.insurance.jobs}
          stats={data.insurance.stats}
        />
      </div>

      {/* Panel 6: Job Health Overview */}
      <div className="md:col-span-2">
        <JobHealthPanel health={data.job_health} />
      </div>

      {/* Panel 7: Action Suggestions */}
      <div className="md:col-span-2 lg:col-span-3">
        <ActionSuggestionsPanel suggestions={data.action_suggestions} />
      </div>
    </div>
  );
}






































