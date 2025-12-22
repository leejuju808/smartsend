// Block 22041 — SmartSend Roofing "Daily Company Pulse" v1
// The Morning Command Center — What Every Roofing Owner Sees at 7:00 AM

"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { JobHealthBadge } from "@/components/JobHealthBadge";
import { RevenueSection } from "./DailyPulse/RevenueSection";
import { HealthDistribution } from "./DailyPulse/HealthDistribution";
import { AtRiskJobList } from "./DailyPulse/AtRiskJobList";
import { EstimatorPerformanceSection } from "./DailyPulse/EstimatorPerformanceSection";
import { AISummaryBox } from "./DailyPulse/AISummaryBox";
import { PipelineMovementSection } from "./DailyPulse/PipelineMovementSection";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

interface DailyPulseData {
  pulse: {
    company_health_score: number;
    avg_job_health: number;
    win_rate_7d: number;
    avg_estimator_perf: number;
    pipeline_velocity: number;
    risk_ratio: number;
    revenue_today: number;
    revenue_last_7_days: number;
    healthy_jobs: number;
    watchlist_jobs: number;
    at_risk_jobs: number;
    estimator_count: number;
    pipeline_events_24h: number;
  };
  atRiskJobs: Array<{
    id: string;
    name?: string;
    email?: string;
    job_health_score: number;
    momentum_score?: number;
    risk_category: string;
    estimated_job_value?: number;
    status: string;
  }>;
  pipelineEvents: Array<{
    id: string;
    lead_id: string;
    event_type: string;
    created_at: string;
    event_data: any;
    lead_name?: string;
  }>;
  estimatorPerformance: Array<{
    estimator_id: string;
    performance_score: number;
    speed_score: number;
    followup_score: number;
    proposal_score: number;
    close_rate_score: number;
    tone_score: number;
    ai_alignment_score: number;
    calculated_at: string;
    name: string;
  }>;
  ai_summary: string;
}

export function DailyPulsePage() {
  const [data, setData] = useState<DailyPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspaceAndData = async () => {
      const wsId = await getActiveWorkspaceId();
      setWorkspaceId(wsId);

      if (!wsId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/daily-pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: wsId }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch pulse data");
        }

        const pulseData = await response.json();
        setData(pulseData);
      } catch (error) {
        console.error("Error fetching daily pulse:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaceAndData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-8">
        <div className="text-center text-muted-foreground">Loading Daily Pulse...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 space-y-8">
        <div className="text-center text-muted-foreground">Failed to load Daily Pulse data</div>
      </div>
    );
  }

  const { pulse, atRiskJobs, pipelineEvents, estimatorPerformance, ai_summary } = data;

  // Determine health score color
  const getHealthScoreColor = (score: number) => {
    if (score >= 75) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* HEADER WITH COMPANY HEALTH SCORE */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold">Daily Company Pulse</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Updated every morning at 7:00 AM • Your command center for today
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Company Health
              </div>
              <div className={`text-6xl font-extrabold ${getHealthScoreColor(pulse.company_health_score)}`}>
                {pulse.company_health_score}
              </div>
              <div className="text-xs text-muted-foreground mt-1">out of 100</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* REVENUE SECTION */}
      <RevenueSection pulse={pulse} />

      {/* JOB HEALTH DISTRIBUTION */}
      <HealthDistribution pulse={pulse} />

      {/* ESTIMATOR PERFORMANCE SNAPSHOT */}
      {estimatorPerformance && estimatorPerformance.length > 0 && (
        <EstimatorPerformanceSection estimators={estimatorPerformance} />
      )}

      {/* JOBS REQUIRING ATTENTION TODAY */}
      {atRiskJobs && atRiskJobs.length > 0 && (
        <AtRiskJobList jobs={atRiskJobs} />
      )}

      {/* PIPELINE MOVEMENT (LAST 24 HOURS) */}
      {pipelineEvents && pipelineEvents.length > 0 && (
        <PipelineMovementSection events={pipelineEvents} />
      )}

      {/* AI SUMMARY */}
      {ai_summary && <AISummaryBox summary={ai_summary} />}
    </div>
  );
}

