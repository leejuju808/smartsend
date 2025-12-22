"use client";

// Block 246000 — Production Command Center Client Component
// The Master Control Room for Roofing Operations

import { useEffect, useState } from "react";
import { CommandCenterTopBar } from "./CommandCenterTopBar";
import { JobPipelineView } from "./JobPipelineView";
import { CrewLiveStatusBoard } from "./CrewLiveStatusBoard";
import { MaterialsTrackingPanel } from "./MaterialsTrackingPanel";
import { WeatherRiskPanel } from "./WeatherRiskPanel";
import { IssueManagementPanel } from "./IssueManagementPanel";
import { ProfitabilityWarningPanel } from "./ProfitabilityWarningPanel";
import { RealTimeEventFeed } from "./RealTimeEventFeed";
import { AIRecommendationsPanel } from "./AIRecommendationsPanel";

interface CommandCenterData {
  summary: {
    active_jobs: number;
    jobs_at_risk: number;
    crews_working_today: number;
    deliveries_today: number;
    weather_risks: number;
    open_issues: number;
  };
  jobs: {
    all: any[];
    byStage: {
      not_scheduled: any[];
      scheduled: any[];
      awaiting_materials: any[];
      in_progress: any[];
      delayed: any[];
      completed: any[];
      needs_walkthrough: any[];
      ready_for_billing: any[];
    };
  };
  crews: any[];
  events: any[];
  alerts: any[];
  dependencies: any[];
  materials: any[];
  weather: any[];
  profitabilityRisks: any[];
}

interface ProductionCommandCenterClientProps {
  workspaceId: string;
}

export function ProductionCommandCenterClient({ workspaceId }: ProductionCommandCenterClientProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const [dashboardRes, recommendationsRes] = await Promise.all([
        fetch("/api/production/dashboard"),
        fetch("/api/production/ai/recommendations"),
      ]);

      const dashboardData = await dashboardRes.json();
      const recommendationsData = await recommendationsRes.json();

      setData(dashboardData);
      setRecommendations(recommendationsData.recommendations || []);
      setLoading(false);
    } catch (error) {
      console.error("Failed to load command center data:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-400">Loading Production Command Center...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Failed to load command center data</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar Summary */}
      <CommandCenterTopBar summary={data.summary} />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI Recommendations */}
        {recommendations.length > 0 && (
          <AIRecommendationsPanel recommendations={recommendations} />
        )}

        {/* Job Pipeline View */}
        <JobPipelineView jobs={data.jobs} onJobUpdate={fetchData} />

        {/* Bottom Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <CrewLiveStatusBoard crews={data.crews} jobs={data.jobs.all} events={data.events} />
            <MaterialsTrackingPanel materials={data.materials} dependencies={data.dependencies} />
            <WeatherRiskPanel weatherAlerts={data.weather} />
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <IssueManagementPanel alerts={data.alerts} onIssueResolved={fetchData} />
            <ProfitabilityWarningPanel risks={data.profitabilityRisks} />
            <RealTimeEventFeed events={data.events} />
          </div>
        </div>
      </div>
    </div>
  );
}

























